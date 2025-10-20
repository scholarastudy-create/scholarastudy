const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const logs = [];
  const log = (msg, data = null) => {
    const logEntry = { message: msg, data, timestamp: new Date().toISOString() };
    logs.push(logEntry);
    console.log(msg, data || '');
  };

  try {
    // Check environment variables
    log('Checking environment variables...');
    const hasUrl = !!process.env.SUPABASE_URL;
    const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    log('Environment check', {
      SUPABASE_URL: hasUrl ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: hasKey ? 'SET (length: ' + (process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0) + ')' : 'MISSING'
    });

    if (!hasUrl || !hasKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Missing environment variables',
          logs,
          envCheck: { hasUrl, hasKey }
        })
      };
    }

    // Create admin client
    log('Creating Supabase admin client...');
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
    log('Admin client created');

    // Get user token
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'No auth header', logs })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    log('Token received', { tokenLength: token.length, tokenPreview: token.substring(0, 20) + '...' });

    // Verify user
    log('Verifying user token...');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      log('Auth verification failed', authError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Auth failed',
          authError: authError?.message,
          logs
        })
      };
    }

    const userId = user.id;
    log('User verified', { userId, email: user.email });

    // List all users (to verify admin access works)
    log('Testing admin API - listing users...');
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1
    });

    if (listError) {
      log('List users failed', listError);
    } else {
      log('List users succeeded', { totalUsers: listData?.users?.length });
    }

    // Try to get the specific user via admin API
    log('Getting user via admin API...');
    const { data: getUserData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError) {
      log('Get user by ID failed', getUserError);
    } else {
      log('Get user by ID succeeded', {
        userId: getUserData?.user?.id,
        email: getUserData?.user?.email
      });
    }

    // NOW TRY THE ACTUAL DELETE
    log('ATTEMPTING TO DELETE USER...');
    const deleteResult = await supabaseAdmin.auth.admin.deleteUser(userId);

    log('Delete result received', {
      hasError: !!deleteResult.error,
      error: deleteResult.error,
      data: deleteResult.data
    });

    if (deleteResult.error) {
      log('DELETE FAILED', deleteResult.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Delete failed',
          deleteError: deleteResult.error,
          logs
        })
      };
    }

    // Verify deletion - try to get user again
    log('Verifying deletion - attempting to get user again...');
    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.admin.getUserById(userId);

    log('Verification result', {
      error: verifyError?.message,
      userStillExists: !!verifyData?.user,
      userData: verifyData?.user
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: !verifyData?.user,
        message: verifyData?.user ? 'User still exists after delete!' : 'User successfully deleted',
        userId,
        logs,
        verificationCheck: {
          userStillExists: !!verifyData?.user,
          verifyError: verifyError?.message
        }
      })
    };

  } catch (error) {
    log('EXCEPTION CAUGHT', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Exception occurred',
        exception: {
          message: error.message,
          name: error.name,
          stack: error.stack
        },
        logs
      })
    };
  }
};
