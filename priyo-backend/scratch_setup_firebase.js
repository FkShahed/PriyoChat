const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: './.env' });

async function setup() {
  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    const client = await auth.getClient();
    const appId = '1:540696667738:android:908084ed392059d6a2da63';

    // Add SHA-1
    try {
      const sha1Res = await client.request({
        url: `https://firebase.googleapis.com/v1beta1/projects/piyochatbd/androidApps/${appId}/sha`,
        method: 'POST',
        data: {
          shaHash: '5E8F16062EA3CD2C4A0D547876BAA6F38CABF625',
          certType: 'SHA_1',
        },
      });
      console.log('Added SHA-1:', JSON.stringify(sha1Res.data));
    } catch (e) {
      console.log('SHA-1 error/exists:', e.response?.data || e.message);
    }

    // Add SHA-256
    try {
      const sha256Res = await client.request({
        url: `https://firebase.googleapis.com/v1beta1/projects/piyochatbd/androidApps/${appId}/sha`,
        method: 'POST',
        data: {
          shaHash: 'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C',
          certType: 'SHA_256',
        },
      });
      console.log('Added SHA-256:', JSON.stringify(sha256Res.data));
    } catch (e) {
      console.log('SHA-256 error/exists:', e.response?.data || e.message);
    }

    // Get Android App config (google-services.json content)
    try {
      const configRes = await client.request({
        url: `https://firebase.googleapis.com/v1beta1/projects/piyochatbd/androidApps/${appId}/config`,
      });
      console.log('Config status:', configRes.status);
      const fs = require('fs');
      if (configRes.data && configRes.data.configFileContents) {
        const decoded = Buffer.from(configRes.data.configFileContents, 'base64').toString('utf8');
        fs.writeFileSync('../android/app/google-services.json', decoded);
        console.log('Saved android/app/google-services.json successfully!');
        console.log('google-services.json preview:', decoded.substring(0, 500));
      }
    } catch (e) {
      console.log('Config download error:', e.response?.data || e.message);
    }
  } catch (err) {
    console.error('Fatal error:', err);
  }
}

setup();
