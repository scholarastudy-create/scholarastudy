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
    
    const customerEmail = session.customer_email;
    
    if (!customerEmail) {
        console.error('No customer email in checkout session');
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
    
    // Find user by email
    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', customerEmail)
        .single();
    
    if (findError || !profiles) {
        console.error('User not found:', customerEmail, findError);
        return;
    }
    
    // Calculate subscription end date
    const endDate = new Date();
    if (billingPeriod === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 6); // Semester = 6 months
    }
    
    // Update user's subscription
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_plan: plan,
            subscription_status: 'active',
            subscription_start_date: new Date().toISOString(),
            subscription_end_date: endDate.toISOString(),
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);
    
    if (updateError) {
        console.error('Error updating user subscription:', updateError);
    } else {
        console.log(`✅ Updated ${customerEmail} to ${plan} plan (${billingPeriod})`);
    }
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription, supabase) {
    console.log('Subscription updated:', subscription.id);
    
    const customerId = subscription.customer;
    
    // Find user by Stripe customer ID
    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();
    
    if (findError || !profiles) {
        console.error('User not found for customer:', customerId);
        return;
    }
    
    // Determine plan from subscription items
    let plan = profiles.subscription_plan;
    if (subscription.items && subscription.items.data.length > 0) {
        const priceId = subscription.items.data[0].price.id;
        plan = determinePlanFromPriceId(priceId);
    }
    
    // Update subscription status
    const status = subscription.status === 'active' ? 'active' : subscription.status;
    
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_plan: plan,
            subscription_status: status,
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);
    
    if (updateError) {
        console.error('Error updating subscription status:', updateError);
    } else {
        console.log(`✅ Updated subscription status for user ${profiles.email} to ${status}`);
    }
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(subscription, supabase) {
    console.log('Subscription deleted:', subscription.id);
    
    const customerId = subscription.customer;
    
    // Find user by Stripe customer ID
    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();
    
    if (findError || !profiles) {
        console.error('User not found for customer:', customerId);
        return;
    }
    
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
        console.error('Error downgrading user:', updateError);
    } else {
        console.log(`✅ Downgraded ${profiles.email} to free plan`);
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
        console.error('User not found for customer:', customerId);
        return;
    }
    
    // Get price ID from invoice to determine billing period
    let billingPeriod = 'monthly';
    if (invoice.lines && invoice.lines.data.length > 0) {
        const priceId = invoice.lines.data[0].price.id;
        billingPeriod = determineBillingPeriod(priceId);
    }
    
    // Extend subscription end date
    const currentEndDate = new Date(profiles.subscription_end_date || new Date());
    const newEndDate = new Date(currentEndDate);
    
    if (billingPeriod === 'monthly') {
        newEndDate.setMonth(newEndDate.getMonth() + 1);
    } else {
        newEndDate.setMonth(newEndDate.getMonth() + 6);
    }
    
    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            subscription_status: 'active',
            subscription_end_date: newEndDate.toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', profiles.id);
    
    if (updateError) {
        console.error('Error extending subscription:', updateError);
    } else {
        console.log(`✅ Extended subscription for ${profiles.email} until ${newEndDate}`);
    }
}

// Handle failed payment
async function handlePaymentFailed(invoice, supabase) {
    console.log('Payment failed:', invoice.id);
    
    const customerId = invoice.customer;
    
    const { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();
    
    if (findError || !profiles) {
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
        console.error('Error marking subscription past due:', updateError);
    } else {
        console.log(`⚠️ Marked ${profiles.email} subscription as past_due`);
    }
}