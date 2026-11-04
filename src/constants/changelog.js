// What's new in each release, newest first. Shown in Settings → App Version popup.
// Add a new entry at the TOP whenever a new version is released.
export const CHANGELOG = [
  {
    version: '3.8.2',
    title: 'Most stable release',
    items: [
      'Calls connect reliably, even when you place several calls back to back',
      'Microphone keeps working when you turn the screen off during a call',
      'Closing the app mid-call now ends the call cleanly for the other person',
      'Fixed old calls ringing late after a burst of calls',
      'Fixed calls getting stuck on "Connecting" on mobile data',
    ],
  },
  {
    version: '3.7.0',
    title: 'Faster, smarter calling',
    items: [
      'Answer or decline a call straight from the notification',
      'Faster call connection when answering from a notification',
      'Automatic retry when a call is answered late or the network changes',
    ],
  },
];
