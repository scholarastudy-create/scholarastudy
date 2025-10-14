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

    // UPLOAD FILE - Use vision purpose for images, assistants for documents
    if (action === 'uploadFile') {
      try {
        const base64Data = fileContent.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        console.log('Uploading file:', fileName, 'Size:', buffer.length, 'bytes');
        
        // Check if it's an image (these use vision purpose and go in message content)
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

        // Return file info with metadata so frontend knows how to handle it
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
      // fileIds should be an array of objects: [{id: 'file-xxx', isImage: true/false}]
      // Or just strings for backwards compatibility
      const files = fileIds || [];
      
      let imageFiles = [];
      let documentFiles = [];
      
      // Separate images from documents based on metadata
      files.forEach(file => {
        if (typeof file === 'object') {
          if (file.isImage) {
            imageFiles.push(file.id);
          } else {
            documentFiles.push(file.id);
          }
        } else {
          // Fallback: assume it's a document if no metadata
          documentFiles.push(file);
        }
      });

      console.log('Processing files - Images:', imageFiles.length, 'Documents:', documentFiles.length);

      let messageContent;
      let attachments;

      // Build message content
      if (imageFiles.length > 0) {
        // Start with text
        messageContent = [
          {
            type: 'text',
            text: message || 'Please analyze these files.'
          }
        ];

        // Add images to content
        imageFiles.forEach(fileId => {
          messageContent.push({
            type: 'image_file',
            image_file: {
              file_id: fileId
            }
          });
        });
      } else {
        messageContent = message || 'Please analyze these files.';
      }

      // Add document attachments if any
      if (documentFiles.length > 0) {
        attachments = documentFiles.map(fileId => ({
          file_id: fileId,
          tools: [
            { type: 'file_search' },
            { type: 'code_interpreter' }
          ]
        }));
      }

      const messageBody = {
        role: 'user',
        content: messageContent
      };

      if (attachments) {
        messageBody.attachments = attachments;
      }

      console.log('Sending message body:', JSON.stringify(messageBody, null, 2));

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
        assistant_id: ASSISTANT_ID
        // Removed instructions - let the Assistant use its configured system prompt
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
