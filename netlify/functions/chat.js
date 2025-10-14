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

    // UPLOAD FILE - Use vision purpose for images
    if (action === 'uploadFile') {
      try {
        const base64Data = fileContent.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log('Uploading file:', fileName, 'Size:', buffer.length, 'bytes');
        
        // Check if it's an image
        const fileExtension = fileName.toLowerCase().split('.').pop();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension);
        const uploadPurpose = isImage ? 'vision' : 'assistants';
        
        console.log('File type:', fileExtension, 'Is image:', isImage, 'Purpose:', uploadPurpose);
        
        const form = new FormData();
        form.append('file', buffer, {
          filename: fileName,
          contentType: 'application/octet-stream'
        });
        form.append('purpose', uploadPurpose);

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

        // Return file info with metadata
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...data,
            isImage: isImage,
            fileName: fileName
          })
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

    // ADD MESSAGE WITH FILES - Different handling for images vs documents
    if (action === 'addMessage') {
      let messageContent;
      let attachments;

      // Parse fileIds to separate images from documents
      const files = fileIds || [];
      const imageFiles = [];
      const documentFiles = [];

      // Note: Frontend should pass metadata to distinguish
      // For now, we'll handle all as content with image_file type
      
      if (files.length > 0) {
        // Build content array with text and images
        messageContent = [
          {
            type: 'text',
            text: message || 'Please analyze these files.'
          }
        ];

        // Add each file as an image_file
        files.forEach(fileId => {
          messageContent.push({
            type: 'image_file',
            image_file: {
              file_id: fileId
            }
          });
        });

        console.log('Message content with images:', JSON.stringify(messageContent, null, 2));
      } else {
        messageContent = message;
      }

      const messageBody = {
        role: 'user',
        content: messageContent
      };

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
      console.log('Message added response:', JSON.stringify(data, null, 2));
      
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
        instructions: 'You are ScholarAI, a helpful study assistant. When users share images, describe what you see in detail and help them understand the content. For documents, analyze and summarize the key information.'
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
