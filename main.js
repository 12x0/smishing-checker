const fs = require('fs');            // Importerer Node.js til filhåndtering (læse/skriv filer)
const path = require('path');        // Importerer Node.js til at arbejde med filstier (danner/normaliserer stier)
const fetch = require('node-fetch'); // Importerer biblioteket "node-fetch" til at lave HTTP-forespørgsler (til API)
const twilio = require('twilio');    // Importerer Twilio, til at sende SMS i Twilio API
const express = require('express');  // Importerer Express, til at lave server og endpoints
const bodyParser = require('body-parser'); // Importerer body-parser, hjælp til læsning af JSON-data fra requests (fx POST-data)

// Filstier
const DATA_FILE = path.join(__dirname, 'data.json'); // Definere DATA_FILE = data.json
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json');  // Definere WHITELIST_FILE = whitelist.json
const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json'); // Definere BLACKLIST_FILE = blacklist.json

// Opret filer hvis de ikke findes
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8'); 
if (!fs.existsSync(WHITELIST_FILE)) fs.writeFileSync(WHITELIST_FILE, '{"domains":[]}', 'utf8'); 
if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, '{"domains":[]}', 'utf8'); 

// Læs whitelist/blacklist ind i JS
const whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8')); 
const blacklist = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8')); 

// Twilio config
const TWILIO_ACCOUNT_SID = 'xxx'; // SID (bruger-ID)
const TWILIO_AUTH_TOKEN = 'xxx'; // auth token (adgangskode)
const TWILIO_FROM_NUMBER = 'xxx'; // telefonnummer

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN); // Twilio client

// OpenAI info
const OPENAI_KEY = 'sk-xxx';  // API nøgle
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'; // API endpoint

// Send SMS via Twilio funktionen
async function sendSMS(to, message) {  // tlf + besked
  try {
    const msg = await client.messages.create({ // Opret besked i Twilio
      body: message,             // Tekst
      from: TWILIO_FROM_NUMBER,  // Fra nummer
      to: to                     // Til nummer
    });
    console.log(`SMS sendt til ${to}, SID: ${msg.sid}`); // Log succes
    return msg;                                          // Returner besked
  } catch (err) {
    console.error('Fejl ved sendSMS:', err);  // Log fejl
  }
}

// Evaluér link via OpenAI
async function evaluateLink(link) {                 // Tager et link ind
  try {
    const res = await fetch(OPENAI_URL, {           // POST request til OpenAI
      method: 'POST',                               // HTTP POST
      headers: {                                    // Headers
        'Authorization': `Bearer ${OPENAI_KEY}`,    // Token
        'Content-Type': 'application/json'          // JSON format
      },
      body: JSON.stringify({                        // Request body
        model: 'gpt-4.1-mini',                      // Model
        messages: [                                 // Prompt
          { role: 'user', content: `Er linket "${link}" sikkert? Svar meget kort: Ja, Nej eller Måske.` }
        ]
      })
    });

    const data = await res.json();                    // Læs svar som JSON
    return data.choices[0].message.content.trim();    // Returner svaret
  } catch (err) {
    console.error('Fejl ved evaluateLink:', err);     // Log fejl
    return 'ukendt';                                  // Hvis fejl -> ukendt
  }
}

// Kig data.json for ændringer
fs.watchFile(DATA_FILE, async () => {                // Kører ved ændringer
  let allData;                                       // Holder hele datasættet
  try {
    allData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); // Læs data.json
  } catch (err) {
    console.error('Fejl ved læsning af data.json:', err);     // Fejl i parsing
    return;                                                   // Afbryd
  }

  const latestEntry = allData[allData.length - 1];            // Sidste entry i listen
  if (!latestEntry || latestEntry.processed) return;          // Drop hvis tom eller allerede kørt

  let { link, telefon } = latestEntry;                        // Hent link og tlf
  if (!link.startsWith('http')) link = 'https://' + link;     // Tilføj https hvis mangler

  let domain;                                                 // Domænevariabel
  try {
    domain = new URL(link).hostname.toLowerCase();            // Træk domæne ud
  } catch {
    console.error('Ugyldigt link, springer over:', link);     // Ugyldigt link
    latestEntry.processed = true;                             // Markér som færdig
    fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8'); // Gem status
    return;
  }

  // Check blacklist
  if (blacklist.domains.includes(domain)) { // Hvis i blacklist
    await sendSMS(telefon, `Linket ${link} er BLACKLISTED`); // Send godkendelse
    latestEntry.processed = true; // Markér færdig
    fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8'); // Gem
    return;
  }

  // Check whitelist
  if (whitelist.domains.includes(domain)) { // Hvis i whitelist
    await sendSMS(telefon, `Linket ${link} er sikkert`); // Send godkendelse
    latestEntry.processed = true; // Markér færdig
    fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8'); // Gem
    return;
  }

  // Evaluer ved hjælp af OpenAI med gpt-4.1-mini (jf. function evaluateLink)
  const result = await evaluateLink(link); // Spørg modellen
  await sendSMS(telefon, `Linket ${link} vurderet: ${result}`); // Send svar
  latestEntry.processed = true; // Markér færdig
  fs.writeFileSync(DATA_FILE, JSON.stringify(allData, null, 2), 'utf8'); // Gem
});

console.log('Link-checker kører og overvåger data.json via Twilio'); // Log at programmet kører

// Express API
const app = express(); // Opret server
app.use(bodyParser.json()); // Brug JSON-parser

// Endpoint til at modtage data
app.post('/submit', (req, res) => {  // POST endpoint
  const { link, telefon } = req.body; // Hent data fra body

  if (!link || !telefon) {  // Hvis data mangler
    return res.status(400).json({ status: 'error', reason: 'link eller telefon mangler' }); // 400 fejl
  }

  try {
    const stored = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); // Læs eksisterende data
    stored.push({                         // Tilføj ny entry
      link,                               // Link
      telefon,                            // Telefon
      timestamp: new Date().toISOString() // Tidsstempel
    });

    fs.writeFileSync(DATA_FILE, JSON.stringify(stored, null, 2), 'utf8'); // Gem alt igen
    return res.json({ status: 'success', message: 'Data modtaget' }); // Succes svar
  } catch (err) {
    return res.status(500).json({ status: 'error', reason: err.message }); // Serverfejl
  }
});

// Start server
const PORT = 3000; // Portnummer
app.listen(PORT, '0.0.0.0', () => console.log(`Server kører på port ${PORT}`)); // Start server
