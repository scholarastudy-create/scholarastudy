// /.netlify/functions/stripe-webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Map Stripe price IDs to subscription plans
function determinePlanFromPriceId(priceId) {
    const priceToPlanMap = {
        // Pro Plans
        'price_1SGgPe8AghzT7EpikDpWOkmJ': 'pro',      // Pro Monthly $5.99
        'price_1SGgXG8AghzT7EpiQTKsi3gL': 'pro',      // Pro Semester $25 (old one-time)
        'price_1SH45l8AghzT7EpidHDvP9dk': 'pro',      // Pro Semester $25 (NEW recurring)
        
        // Premium Plans
        'price_1SGgQy8AghzT7EpidhWipxf1': 'premium',  // Premium Monthly $9.99
        'price_1SGgXf8AghzT7Epig0Rx6SG7': 'premium',  // Premium Semester $45 (old one-time)
        'price_1SH45p8AghzT7EpiQTyDhixB': 'premium',  // Premium Semester $45 (NEW recurring)
    };

    return priceToPlanMap[priceId] || 'free';
}

// Determine billing period from price ID
function determineBillingPeriod(priceId) {
    const monthlyPrices = [
        'price_1SGgPe8AghzT7EpikDpWOkmJ',  // Pro Monthly
        'price_1SGgQy8AghzT7EpidhWipxf1',  // Premium Monthly
    ];
    
    return monthlyPrices.includes(priceId) ? 'monthly' : 'semester';
}

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    let stripeEvent;

    try {
        // Verify the webhook signature
        const sig = event.headers['stripe-signature'];
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `Webhook Error: ${err.message}` })
        };
    }

    console.log('Received Stripe event:', stripeEvent.type);

    // Handle the event
    try {
        switch (stripeEvent.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(stripeEvent.data.object, supabase);
                break;

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(stripeEvent.data.object, supabase);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(stripeEvent.data.object, supabase);
                break;

            case 'invoice.paid':
                await handleInvoicePaid(stripeEvent.data.object, supabase);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(stripeEvent.data.object, supabase);
                break;

            default:
                console.log(`Unhandled event type: ${stripeEvent.type}`);
        }
    } catch (error) {
        console.error('Error handling webhook:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ received: true })
    };
};

// Handle successful checkout
async function handleCheckoutCompleted(session, supabase) {
    console.log('Checkout completed:', session.id);
    console.log('Session client_reference_id:', session.client_reference_id);

    let profiles = null;
    let findError = null;

    // PRIORITY 1: Try to find user by client_reference_id (most reliable)
    if (session.client_reference_id) {
        console.log('Looking up user by client_reference_id:', session.client_reference_id);
        const result = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.client_reference_id)
            .single();

        profiles = result.data;
        findError = result.error;

        if (profiles) {
            console.log('✓ Found user by client_reference_id:', profiles.email);
        } else {
            console.log('✗ User not found by client_reference_id');
        }
    }

    // PRIORITY 2: Fall back to email lookup
    if (!profiles) {
        // Try multiple ways to get the customer email
        let customerEmail = session.customer_email ||
                           (session.customer_details && session.customer_details.email) ||
                           null;

        console.log('Session data:', {
            customer_email: session.customer_email,
            customer_details: session.customer_details,
            final_email: customerEmail
        });

        if (!customerEmail && session.customer) {
            try {
                const customer = await stripe.customers.retrieve(session.customer);
                customerEmail = customer.email;
                console.log('Retrieved email from customer object:', customerEmail);
            } catch (err) {
                console.error('Could not retrieve customer:', err);
            }
        }

        if (customerEmail) {
            console.log('Looking up user by email:', customerEmail);
            const result = await supabase
                .from('profiles')
                .select('*')
                .eq('email', customerEmail)
                .single();

            profiles = result.data;
            findError = result.error;

            if (profiles) {
                console.log('✓ Found user by email:', customerEmail);
            }
        }
    }

    // If still no user found, log detailed error and return
    if (!profiles) {
        console.error('❌ CRITICAL: User not found for checkout session', {
            session_id: session.id,
            client_reference_id: session.client_reference_id,
            customer_email: session.customer_email,
            customer_id: session.customer,
            error: findError
        });
        return;
    }

    // Get line items to determine the plan
    let plan = 'pro';
    let billingPeriod = 'monthly';

    try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        if (lineItems.data && lineItems.data.length > 0) {
            const priceId = lineItems.data[0].price.id;
            console.log('Price ID:', priceId);

            plan = determinePlanFromPriceId(priceId);
            billingPeriod = determineBillingPeriod(priceId);
        }
    } catch (err) {
        console.error('Error fetching line items:', err);
    }

    console.log('Assigning plan:', plan, 'with billing period:', billingPeriod);
    
    // Calculate subscription end date
    const startDate = new Date();
    const endDate = new Date();
    if (billingPeriod === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 6); // Semester = 6 months
    }

    console.log('Creating subscription:', {
        user: profiles.email,
        user_id: profiles.id,
        plan: plan,
        billing_period: billingPeriod,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription
    });

    // Update user's subscription
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_plan: plan,
            subscription_status: 'active',
            subscription_start_date: startDate.toISOString(),
            subscription_end_date: endDate.toISOString(),
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);

    if (updateError) {
        console.error('❌ Error updating user subscription:', updateError);
        // Log the full error for debugging
        console.error('Update error details:', JSON.stringify(updateError, null, 2));
    } else {
        console.log(`✅ Successfully activated ${plan} ${billingPeriod} subscription for ${profiles.email} (valid until ${endDate.toISOString()})`);
    }
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription, supabase) {
    console.log('Subscription updated:', subscription.id);
    console.log('Subscription status:', subscription.status);

    const customerId = subscription.customer;

    // Find user by Stripe customer ID
    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();

    if (findError || !profiles) {
        console.error('❌ User not found for customer:', customerId, findError);
        return;
    }

    // Determine plan from subscription items
    let plan = profiles.subscription_plan;
    if (subscription.items && subscription.items.data.length > 0) {
        const priceId = subscription.items.data[0].price.id;
        plan = determinePlanFromPriceId(priceId);
        console.log('Plan from subscription items:', plan, '(price:', priceId, ')');
    }

    // Map Stripe status to our subscription status
    const statusMap = {
        'active': 'active',
        'past_due': 'past_due',
        'canceled': 'cancelled',
        'unpaid': 'past_due',
        'incomplete': 'inactive',
        'incomplete_expired': 'expired',
        'trialing': 'active'
    };
    const status = statusMap[subscription.status] || subscription.status;

    console.log('Updating subscription:', {
        user: profiles.email,
        plan: plan,
        status: status,
        stripe_status: subscription.status
    });

    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_plan: plan,
            subscription_status: status,
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);

    if (updateError) {
        console.error('❌ Error updating subscription status:', updateError);
    } else {
        console.log(`✅ Updated subscription for ${profiles.email}: ${plan} plan, status: ${status}`);
    }
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(subscription, supabase) {
    console.log('Subscription deleted/cancelled:', subscription.id);
    console.log('Cancellation details:', {
        customer: subscription.customer,
        status: subscription.status,
        ended_at: subscription.ended_at,
        canceled_at: subscription.canceled_at
    });

    const customerId = subscription.customer;

    // Find user by Stripe customer ID
    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();

    if (findError || !profiles) {
        console.error('❌ User not found for customer:', customerId, findError);
        return;
    }

    console.log(`Downgrading user ${profiles.email} from ${profiles.subscription_plan} to free plan`);

    // Downgrade to free plan
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_plan: 'free',
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);

    if (updateError) {
        console.error('❌ Error downgrading user:', updateError);
    } else {
        console.log(`✅ Successfully downgraded ${profiles.email} from ${profiles.subscription_plan} to free plan`);
    }
}

// Handle successful invoice payment (recurring payments)
async function handleInvoicePaid(invoice, supabase) {
    console.log('Invoice paid:', invoice.id);

    const customerId = invoice.customer;

    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();

    if (findError || !profiles) {
        console.error('❌ User not found for customer:', customerId, findError);
        return;
    }

    // Get price ID from invoice to determine billing period and plan
    let billingPeriod = 'monthly';
    let plan = profiles.subscription_plan; // Default to current plan

    if (invoice.lines && invoice.lines.data.length > 0) {
        const priceId = invoice.lines.data[0].price.id;
        billingPeriod = determineBillingPeriod(priceId);
        plan = determinePlanFromPriceId(priceId); // Update plan in case of upgrade/downgrade
        console.log('Invoice line item - Price ID:', priceId, 'Plan:', plan, 'Billing:', billingPeriod);
    }

    // Extend subscription end date
    // Use the LATER of: current time OR existing end date
    // This prevents issues if subscription already expired
    const now = new Date();
    const existingEndDate = profiles.subscription_end_date ? new Date(profiles.subscription_end_date) : now;
    const baseDate = existingEndDate > now ? existingEndDate : now;
    const newEndDate = new Date(baseDate);

    if (billingPeriod === 'monthly') {
        newEndDate.setMonth(newEndDate.getMonth() + 1);
    } else {
        newEndDate.setMonth(newEndDate.getMonth() + 6);
    }

    console.log('Extending subscription:', {
        user: profiles.email,
        existing_end: profiles.subscription_end_date,
        base_date: baseDate.toISOString(),
        new_end: newEndDate.toISOString(),
        billing_period: billingPeriod,
        plan: plan
    });

    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_plan: plan,
            subscription_status: 'active',
            subscription_end_date: newEndDate.toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);

    if (updateError) {
        console.error('❌ Error extending subscription:', updateError);
    } else {
        console.log(`✅ Extended ${plan} subscription for ${profiles.email} until ${newEndDate.toISOString()}`);
    }
}

// Handle failed payment
async function handlePaymentFailed(invoice, supabase) {
    console.log('⚠️ Payment failed:', invoice.id);
    console.log('Invoice details:', {
        customer: invoice.customer,
        amount_due: invoice.amount_due,
        attempt_count: invoice.attempt_count,
        next_payment_attempt: invoice.next_payment_attempt
    });

    const customerId = invoice.customer;

    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();

    if (findError || !profiles) {
        console.error('❌ User not found for customer:', customerId, findError);
        return;
    }

    // Mark subscription as past_due
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_status: 'past_due',
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);

    if (updateError) {
        console.error('❌ Error marking subscription past due:', updateError);
    } else {
        console.log(`⚠️ Marked ${profiles.email} subscription as past_due (attempt ${invoice.attempt_count})`);
    }
}