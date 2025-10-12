const fetch = require('node-fetch');
const FormData = require('form-data');

exports.handler = async (event, context) => {
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
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      console.log('Thread created:', data);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // UPLOAD FILE
    if (action === 'uploadFile') {
      try {
        const base64Data = fileContent.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log('Uploading file:', fileName, 'Size:', buffer.length, 'bytes');
        
        const form = new FormData();
        form.append('file', buffer, {
          filename: fileName,
          contentType: 'application/octet-stream'
        });
        form.append('purpose', 'assistants');

        const response = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            ...form.getHeaders()
          },
          body: form
        });

        const data = await response.json();
        console.log('File uploaded:', data);
        
        if (!response.ok) {
          console.error('Upload failed:', data);
          return {
            statusCode: response.status,
            headers,
            body: JSON.stringify({ error: 'File upload failed', details: data })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(data)
        };
      } catch (error) {
        console.error('Upload exception:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: error.message })
        };
      }
    }

    // ADD MESSAGE WITH FILES
    if (action === 'addMessage') {
      const messageBody = {
        role: 'user',
        content: message
      };

      // Attach files using attachments format for Assistants v2
      if (fileIds && fileIds.length > 0) {
        messageBody.attachments = fileIds.map(fileId => ({
          file_id: fileId,
          tools: [
            { type: 'file_search' },
            { type: 'code_interpreter' }  // Required for images and data files
          ]
        }));
        
        console.log('Adding message with attachments:', JSON.stringify(messageBody, null, 2));
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
      console.log('Message added:', data);
      
      if (!response.ok) {
        console.error('Failed to add message:', data);
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: 'Failed to add message', details: data })
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // RUN ASSISTANT
    if (action === 'runAssistant') {
      const runBody = {
        assistant_id: ASSISTANT_ID,
        instructions: 'You are ScholarAI, a helpful study assistant. If the user has attached any files, analyze them thoroughly and reference specific content from the files in your response. For images, describe what you see. For documents, summarize key points and answer questions about the content.'
      };

      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify(runBody)
      });
      
      const data = await response.json();
      console.log('Run started:', data);
      
      if (!response.ok) {
        console.error('Failed to start run:', data);
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ error: 'Failed to start run', details: data })
        };
      }
      
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
      
      // Log if there are any errors
      if (data.last_error) {
        console.error('Run error:', data.last_error);
      }
      
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
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};
