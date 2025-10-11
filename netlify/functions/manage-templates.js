// /.netlify/functions/manage-templates.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = 'talonflinders@gmail.com';

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'No authorization header' })
            };
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user || user.email !== ADMIN_EMAIL) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Forbidden - Admin access required' })
            };
        }

        const body = JSON.parse(event.body);
        const { action, templateId, templateData, active } = body;

        switch (action) {
            case 'toggle':
                const { data: toggleData, error: toggleError } = await supabase
                    .from('templates')
                    .update({ active: active })
                    .eq('id', templateId)
                    .select();

                if (toggleError) throw toggleError;

                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        success: true, 
                        message: `Template ${active ? 'activated' : 'deactivated'} successfully`,
                        data: toggleData 
                    })
                };

            case 'create':
                const { data: createData, error: createError } = await supabase
                    .from('templates')
                    .insert([{ ...templateData, active: true, order_index: 999 }])
                    .select();

                if (createError) throw createError;

                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        success: true, 
                        message: 'Template created successfully',
                        data: createData 
                    })
                };

            case 'update':
                const { data: updateData, error: updateError } = await supabase
                    .from('templates')
                    .update(templateData)
                    .eq('id', templateId)
                    .select();

                if (updateError) throw updateError;

                return {
                    statusCode: 200,
                    body: JSON.stringify({ 
                        success: true, 
                        message: 'Template updated successfully',
                        data: updateData 
                    })
                };

            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid action' })
                };
        }
    } catch (error) {
        console.error('Template management error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Internal server error', 
                details: error.message 
            })
        };
    }
};