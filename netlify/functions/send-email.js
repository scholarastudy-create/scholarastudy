const { Resend } = require('resend');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { to, subject, html, text } = JSON.parse(event.body);

  try {
    const data = await resend.emails.send({
      from: 'Scholara <onboarding@resend.dev>',
      to: to,
      subject: subject,
      html: html,
      text: text
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: data.id })
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};