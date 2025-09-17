# smishing-checker
A simple Node.js service that receives links via API, checks them against a whitelist/blacklist or evaluates them via OpenAI, and sends the result back to the user via SMS using Twilio.  

---

## Libraries
This project uses the following Node.js libraries:

- [**node-fetch**](https://www.npmjs.com/package/node-fetch) – for making HTTP requests to APIs  
- [**twilio**](https://www.npmjs.com/package/twilio) – Twilio SDK to send SMS messages  
- [**express**](https://www.npmjs.com/package/express) – web server framework to create API endpoints  
- [**body-parser**](https://www.npmjs.com/package/body-parser) – parses JSON body in POST requests  
- **fs** (built-in) – file handling (read/write files)  
- **path** (built-in) – handling and normalizing file paths  

> All external dependencies are installed via `npm` and stored in the `node_modules` folder.

<details>
<summary>How to install the external dependencies</summary>

```bash
# Install node-fetch
npm install node-fetch

# Install Twilio SDK
npm install twilio

# Install Express
npm install express

# Install body-parser
npm install body-parser
```
</details>

> *Note*: `fs` and `path` are built-in Node.js modules, no installation required.

---

## Hosting

This project runs a Node.js server that must be publicly accessible so your iOS Shortcuts can send links to it. While it’s possible to run locally, a VPS is recommended.

**Recommended setup on a VPS:**

1. **Choose a VPS provider** (e.g., DigitalOcean, Linode, AWS EC2).  
2. **Install Node.js** (v18+ recommended).  
3. **Clone the repository**:  
 ```bash
    git clone "https://github.com/gawinecki/smishing-checker.git"
    cd smishing-checker
  ```
4. **Install dependencies**:
 ```bash
    npm install
 ```
6. **Start the server (default port 3000)**:
 ```bash
    node index.js
 ```
8. **Configure firewall** to allow incoming traffic on port 3000.
9. **Update Shortcuts URL** with your VPS IP or domain:
`http://<YOUR_VPS_IP>:3000/submit`

> *Optional:* Use a process manager like `pm2` for persistent server uptime, and consider setting up HTTPS for security.

---

## iOS Setup (Shortcuts App)

To integrate this project with the iOS **Shortcuts** app, create an automation that automatically detects incoming links in text messages and sends them to your server.

### 1. Create a new automation
- Open **Shortcuts** → **Automation** → **Create Personal Automation**  
- Select **Message** as the trigger  
- Under "When":  
  - Choose **Message Contains** → enter `https://`  
  - (Optionally, create a second automation for `http://`)  
- Sender: Leave as *Any Sender* so it applies to all incoming messages  

### 2. Add actions
Add the following steps in order:

1. **Get Contents of URL**  
   - URL: `http://<YOUR_VPS_IP>:3000/submit`  
   - Method: `POST`  
   - Headers:  
     - `Content-Type` → `application/json`  
   - Request Body (JSON):  
   ```json
   {
     "link": "Shortcut Input",   // Automatically uses the received link from the message
     "telefon": "<YOUR_PHONE_NUMBER>"
   }
     ```

> *Optional:* Add a **Show Notification** step to confirm that the link was sent to the server.  

### 3. Save and activate the automation
- Disable **Ask Before Running** so it executes automatically.  
- Test by sending yourself a message containing a link.  

---

## Flow Overview
1. You receive an SMS containing a link.  
2. The automation in the Shortcuts app captures the link and sends it to your Node.js server.  
3. The server stores the link in `data.json`.  
4. The script checks the link against the whitelist/blacklist or evaluates it via OpenAI.  
5. The result is sent back to your phone as an SMS via Twilio.  

---

## Example Request
You can also test manually using `curl`:  

```bash
curl -X POST http://<YOUR_VPS_IP>:3000/submit \
  -H "Content-Type: application/json" \
  -d '{"link":"https://example.com","telefon":"+4512345678"}'

