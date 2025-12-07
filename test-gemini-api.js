// Test script for Gemini 2.0 Flash API key
const API_KEY = 'AIzaSyCDfaOK_kz9y8uIg2Vg81Oug4YkLOLRhMs';

async function testGeminiAPI() {
  console.log('Testing Gemini 2.0 Flash API...');
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Say "Hello, API test successful!" in exactly 5 words.'
            }]
          }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 100,
            topP: 0.9,
            topK: 40
          }
        })
      }
    );
    
    const data = await response.json();
    
    if (data.error) {
      console.error('❌ API Error:', data.error);
      if (data.error.message) {
        console.error('Error message:', data.error.message);
        if (data.error.message.includes('quota') || data.error.message.includes('limit')) {
          console.error('⚠️  API quota/limit exceeded!');
        } else if (data.error.message.includes('invalid') || data.error.message.includes('API key')) {
          console.error('⚠️  API key is invalid!');
        }
      }
      return false;
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (content) {
      console.log('✅ API Key is working!');
      console.log('Response:', content);
      return true;
    } else {
      console.error('❌ No content in response');
      console.log('Full response:', JSON.stringify(data, null, 2));
      return false;
    }
    
  } catch (error) {
    console.error('❌ Network/Request Error:', error.message);
    return false;
  }
}

// Run the test
testGeminiAPI()
  .then(success => {
    if (success) {
      console.log('\n✅ Test completed successfully - API key is valid and working!');
      process.exit(0);
    } else {
      console.log('\n❌ Test failed - API key may be invalid or quota exceeded');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
