const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
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
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    console.log('Starting account deletion for user:', user.id);

    // Step 1: Delete study guide requests
    const { error: requestsError } = await supabase
      .from('study_guide_requests')
      .delete()
      .eq('user_id', user.id);

    if (requestsError) {
      console.warn('Study guide requests deletion warning:', requestsError);
    }

    // Step 2: Delete user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (profileError) {
      console.error('Profile deletion error:', profileError);
      throw new Error('Failed to delete profile data: ' + profileError.message);
    }

    // Step 3: Delete user from Supabase Auth (requires admin privileges)
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.error('Auth user deletion error:', deleteUserError);
      throw new Error('Failed to delete user account: ' + deleteUserError.message);
    }

    console.log('Account deletion successful for user:', user.id);

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
        error: error.message || 'Failed to delete account'
      })
    };
  }
};
