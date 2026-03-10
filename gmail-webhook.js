/**
 * Gmail Webhook Notifier
 * 
 * Instructions:
 * 1. Go to https://script.google.com and create a new project
 * 2. Paste this code
 * 3. Save and run once to authorize
 * 4. Edit → Current project's triggers → Add trigger
 * 5. Set: Choose which function → notifyOnNewEmails
 * 6. Set: Select event source → Time-driven
 * 7. Set: Select type of time based trigger → Minutes timer
 * 8. Set: Select minute interval → Every minute
 * 9. Save and authorize
 */

const WEBHOOK_URL = 'https://command-center-cyan-three.vercel.app/api/webhook';

function notifyOnNewEmails() {
  const label = GmailApp.getUserLabelByName('WebhookNotified');
  const threads = GmailApp.getInboxUnreadThreads(0, 25);
  
  if (threads.length === 0) return;
  
  // Create label if it doesn't exist
  let newLabel = label;
  if (!label) {
    newLabel = GmailApp.createLabel('WebhookNotified');
  }
  
  for (let i = 0; i < threads.length; i++) {
    const thread = threads[i];
    const messages = thread.getMessages();
    const lastMessage = messages[messages.length - 1];
    
    const emailData = {
      subject: lastMessage.getSubject(),
      from: lastMessage.getFrom(),
      snippet: lastMessage.getPlainBody().substring(0, 200),
      date: lastMessage.getDate().toISOString()
    };
    
    // Send to webhook
    try {
      const options = {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(emailData)
      };
      UrlFetchApp.fetch(WEBHOOK_URL, options);
      
      // Mark as notified
      thread.addLabel(newLabel);
    } catch (e) {
      Logger.log('Error: ' + e);
    }
  }
}

// For testing - run this manually
function testWebhook() {
  const messages = GmailApp.getInboxMessages(0, 1);
  if (messages.length > 0) {
    const m = messages[0];
    const emailData = {
      subject: m.getSubject(),
      from: m.getFrom(),
      snippet: m.getPlainBody().substring(0, 200),
      date: m.getDate().toISOString()
    };
    
    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(emailData)
    });
    
    Logger.log('Test email sent: ' + JSON.stringify(emailData));
  }
}
