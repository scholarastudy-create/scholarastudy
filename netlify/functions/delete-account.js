const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing environment variables!');
    console.error('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
    console.error('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Server configuration error',
        details: 'Missing Supabase credentials. Please contact support.'
      })
    };
  }

  // Create admin client with service role key
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  // Get user from authorization header
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    console.error('No authorization header provided');
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized - No auth header' })
    };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    console.log('Step 1: Verifying user token...');

    // Verify user with the token using admin client
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth verification failed:', authError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Unauthorized - Invalid token',
          details: authError?.message
        })
      };
    }

    const userId = user.id;
    console.log('Step 2: User verified, ID:', userId);

    // Step 3: Delete related data first (study guide requests)
    console.log('Step 3: Deleting study guide requests...');
    try {
      const { error: requestsError } = await supabaseAdmin
        .from('study_guide_requests')
        .delete()
        .eq('user_id', userId);

      if (requestsError) {
        console.warn('Study guide requests deletion warning:', requestsError);
      } else {
        console.log('Study guide requests deleted');
      }
    } catch (err) {
      console.warn('Non-critical error deleting study guide requests:', err);
    }

    // Step 4: Delete profile data
    console.log('Step 4: Deleting profile...');
    try {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) {
        console.warn('Profile deletion warning:', profileError);
      } else {
        console.log('Profile deleted');
      }
    } catch (err) {
      console.warn('Non-critical error deleting profile:', err);
    }

    // Step 5: Delete the auth user using admin API
    console.log('Step 5: Deleting auth user (critical step)...');
    const { data: deleteData, error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('CRITICAL: Failed to delete auth user:', deleteUserError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to delete user account from authentication system',
          details: deleteUserError.message
        })
      };
    }

    console.log('Step 6: Auth user deleted successfully!', deleteData);
    console.log('Account deletion completed for user:', userId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Account deleted successfully',
        userId: userId
      })
    };

  } catch (error) {
    console.error('UNEXPECTED ERROR during account deletion:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to delete account',
        details: error.message,
        type: error.constructor.name
      })
    };
  }
};
