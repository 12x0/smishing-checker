const fs = require('fs');            // Importerer Node.js til filhåndtering (læse/skriv filer)
const path = require('path');        // Importerer Node.js til at arbejde med filstier (danner/normaliserer stier)
const fetch = require('node-fetch'); // Importerer biblioteket "node-fetch" til at lave HTTP-forespørgsler (til API)
const twilio = require('twilio');    // Importerer Twilio, til at sende SMS i Twilio API
const express = require('express');  // Importerer Express, til at lave server og endpoints
const bodyParser = require('body-parser'); // Importerer body-parser, hjælp til læsning af JSON-data fra requests (fx POST-data)

// Paths
const DATA_FILE = path.join(__dirname, 'data.json'); // Definere DATA_FILE = data.json
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json');  // Definere WHITELIST_FILE = whitelist.json
const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json'); // Definere BLACKLIST_FILE = blacklist.json

// Sørg for at filer eksisterer (fra de definerede ovenover)
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8'); 
if (!fs.existsSync(WHITELIST_FILE)) fs.writeFileSync(WHITELIST_FILE, '{"domains":[]}', 'utf8'); 
if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, '{"domains":[]}', 'utf8'); 

// Load whitelist/blacklist og gemmer som objekt
const whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8')); 
const blacklist = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8')); 

// Twilio config
const TWILIO_ACCOUNT_SID = 'xxx'; // SID (bruger-ID)
const TWILIO_AUTH_TOKEN = 'xxx'; // auth token (adgangskode)
const TWILIO_FROM_NUMBER = 'xxx'; // telefonnummer der sender SMS'er (den gratis)

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// OpenAI API config
const OPENAI_KEY = 'sk-xxx';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// Send SMS via Twilio funktionen
async function sendSMS(to, message) {
  try {
    const msg = await client.messages.create({
      body: message,
      from: TWILIO_FROM_NUMBER,
      to: to
    });
    console.log(`SMS sendt til ${to}, SID: ${msg.sid}`);
    return msg;
  } catch (err) {
    console.error('Fejl ved sendSMS:', err);
  }
}

// Evaluér link via OpenAI
async function evaluateLink(link) {
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'user', content: `Er linket "${link}" sikkert? Svar meget kort: Ja, Nej eller Måske.` }
        ]
      })
    });

    const data = await res.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error('Fejl ved evaluateLink:', err);
    return 'ukendt';
  }
}

// Watch data.json for ændringer
fs.watchFile(DATA_FILE, async () => {
  let allData;
  try {
    allData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Fejl ved læsning af data.json:', err);
    return;
  }

  const latestEntry = allData[allData.length - 1]; 
  if (!latestEntry || latestEntry.processed) return;

  let { link, telefon } = latestEntry;
  if (!link.startsWith('http')) link = 'https://' + link;

  let domain;
  try {
    domain = new URL(link).hostname.toLowerCase();
  } catch {
    console.error('Ugyldigt link, springer over:', link);
    latestEntry.processed = true;
    fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8');
    return;
  }

  // Check blacklist
  if (blacklist.domains.includes(domain)) {
    await sendSMS(telefon, `Linket ${link} er BLACKLISTED`);
    latestEntry.processed = true;
    fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8');
    return;
  }

  // Check whitelist
  if (whitelist.domains.includes(domain)) {
    await sendSMS(telefon, `Linket ${link} er sikkert`);
    latestEntry.processed = true;
    fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8');
    return;
  }

  // Evaluer ved hjælp af OpenAI med gpt-4.1-mini (jf. function evaluateLink)
  const result = await evaluateLink(link);
  await sendSMS(telefon, `Linket ${link} vurderet: ${result}`);
  latestEntry.processed = true;
  fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8');
});

console.log('Link-checker kører og overvåger data.json via Twilio');

// Express API
const app = express();
app.use(bodyParser.json());

// Endpoint til Shortcuts
app.post('/submit', (req, res) => {
  const { link, telefon } = req.body;

  if (!link || !telefon) {
    return res.status(400).json({ status: 'error', reason: 'link eller telefon mangler' });
  }

  try {
    const stored = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    stored.push({
      link,
      telefon,
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(DATA_FILE, JSON.stringify(stored, null, 2), 'utf8');
    return res.json({ status: 'success', message: 'Data modtaget' });
  } catch (err) {
    return res.status(500).json({ status: 'error', reason: err.message });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server kører på port ${PORT}`));
