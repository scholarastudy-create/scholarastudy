const fetch = require('node-fetch');
const FormData = require('form-data');

exports.handler = async (event, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const ASSISTANT_ID = process.env.ASSISTANT_ID;

  const { action, threadId, message, runId, fileContent, fileName, purpose, fileIds } = JSON.parse(event.body);

  try {
    // CREATE THREAD
    if (action === 'createThread') {
      const response = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const data = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // UPLOAD FILE - FIXED VERSION
    if (action === 'uploadFile') {
      try {
        // Convert base64 to buffer
        const base64Data = fileContent.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log('Uploading file:', fileName, 'Size:', buffer.length, 'bytes');
        
        // Create form data
        const form = new FormData();
        form.append('file', buffer, {
          filename: fileName,
          contentType: 'application/octet-stream'
        });
        form.append('purpose', purpose || 'assistants');

        // Upload to OpenAI
        const response = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            ...form.getHeaders()
          },
          body: form
        });

        const data = await response.json();
        
        console.log('OpenAI file upload response:', data);
        
        if (!response.ok) {
          console.error('OpenAI error:', data);
          return {
            statusCode: response.status,
            headers,
            body: JSON.stringify({ error: 'OpenAI file upload failed', details: data })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(data)
        };
      } catch (error) {
        console.error('File upload exception:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'File upload failed', message: error.message })
        };
      }
    }

    // ADD MESSAGE (with optional file attachments)
    if (action === 'addMessage') {
      const messageBody = {
        role: 'user',
        content: message
      };

      // Add file attachments if provided
      if (fileIds && fileIds.length > 0) {
        messageBody.attachments = fileIds.map(fileId => ({
          file_id: fileId,
          tools: [{ type: 'file_search' }]
        }));
        
        console.log('Adding message with file attachments:', messageBody);
      }

      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify(messageBody)
      });
      
      const data = await response.json();
      console.log('Message added response:', data);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // RUN ASSISTANT
    if (action === 'runAssistant') {
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          assistant_id: ASSISTANT_ID
        })
      });
      const data = await response.json();
      
      console.log('Assistant run started:', data);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // CHECK STATUS
    if (action === 'checkStatus') {
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const data = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // GET MESSAGES
    if (action === 'getMessages') {
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      const data = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action' })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, details: error.toString() })
    };
  }
};
