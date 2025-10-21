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

  const body = JSON.parse(event.body);
  const { action, threadId, message, runId, fileContent, fileName, purpose, fileIds, fileId } = body;

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

        // Get file extension and determine MIME type
        const fileExtension = fileName.toLowerCase().split('.').pop();

        // MIME type mapping for all supported file types
        const mimeTypes = {
          // Images
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          // Documents
          'pdf': 'application/pdf',
          'txt': 'text/plain',
          'md': 'text/markdown',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'ppt': 'application/vnd.ms-powerpoint',
          'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'csv': 'text/csv',
          'json': 'application/json',
          'xml': 'application/xml',
          'html': 'text/html',
          'htm': 'text/html',
          // Code files
          'py': 'text/x-python',
          'js': 'text/javascript',
          'ts': 'text/typescript',
          'java': 'text/x-java',
          'c': 'text/x-c',
          'cpp': 'text/x-c++',
          'h': 'text/x-c',
          'css': 'text/css',
          'php': 'text/x-php',
          'rb': 'text/x-ruby',
          'go': 'text/x-go',
          'rs': 'text/x-rust',
          'sh': 'text/x-sh',
          // Archives and data
          'zip': 'application/zip',
          'tar': 'application/x-tar',
          'gz': 'application/gzip'
        };

        // Check if it's an image (these use vision purpose and go in message content)
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        const isImage = imageExtensions.includes(fileExtension);
        const uploadPurpose = isImage ? 'vision' : 'assistants';

        // Get proper MIME type or default to octet-stream
        const mimeType = mimeTypes[fileExtension] || 'application/octet-stream';

        console.log('File type:', fileExtension, 'MIME:', mimeType, 'Is image:', isImage, 'Purpose:', uploadPurpose);

        const form = new FormData();
        form.append('file', buffer, {
          filename: fileName,
          contentType: mimeType
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
            body: JSON.stringify({
              error: 'File upload failed',
              details: data,
              message: `Failed to upload ${fileName}. ${data.error?.message || 'Unknown error'}`
            })
          };
        }

        // Return file info with metadata so frontend knows how to handle it
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...data,
            isImage: isImage,
            fileName: fileName,
            mimeType: mimeType
          })
        };
      } catch (error) {
        console.error('Upload exception:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: error.message,
            message: `Failed to process file upload: ${error.message}`
          })
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
      
      // Check if assistant generated any files
      if (data.data && data.data.length > 0) {
        const assistantMessage = data.data.find(msg => msg.role === 'assistant');
        if (assistantMessage && assistantMessage.attachments && assistantMessage.attachments.length > 0) {
          console.log('Assistant generated files:', assistantMessage.attachments);
        }
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // DOWNLOAD FILE - New action to retrieve generated files
    if (action === 'downloadFile') {
      const { fileId } = JSON.parse(event.body);
      
      const response = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      });
      
      const fileContent = await response.buffer();
      
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="document.pdf"'
        },
        body: fileContent.toString('base64'),
        isBase64Encoded: true
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
