const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get user from authorization header
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized - No auth header' })
    };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized - Invalid token' })
      };
    }

    const userId = user.id;
    console.log('Deleting account for user:', userId);

    // Step 1: Delete related data first (study guide requests)
    try {
      const { error: requestsError } = await supabase
        .from('study_guide_requests')
        .delete()
        .eq('user_id', userId);

      if (requestsError) {
        console.warn('Study guide requests deletion warning:', requestsError);
      }
    } catch (err) {
      console.warn('Non-critical error deleting study guide requests:', err);
    }

    // Step 2: Delete profile data
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) {
        console.warn('Profile deletion warning:', profileError);
      }
    } catch (err) {
      console.warn('Non-critical error deleting profile:', err);
    }

    // Step 3: Delete the auth user using admin API
    // This is the critical step that actually removes the user from Supabase Auth
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('Failed to delete auth user:', deleteUserError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to delete user account',
          details: deleteUserError.message
        })
      };
    }

    console.log('Successfully deleted user account:', userId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Account deleted successfully'
      })
    };

  } catch (error) {
    console.error('Account deletion error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to delete account',
        details: error.message
      })
    };
  }
};
