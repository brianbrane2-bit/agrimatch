require('dotenv').config();
const africastalking = require('africastalking');

const AT = africastalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

async function testSMS() {
  try {
    // Put YOUR real Cameroon number here, format: 237XXXXXXXXX (no +, no leading zero)
    const result = await AT.SMS.send({
      to: ['237651712730'],  // <-- replace with your actual number
      message: 'AgriMatch test: if you got this, the SMS pipeline works.'
    });
    console.log('Success:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

testSMS();