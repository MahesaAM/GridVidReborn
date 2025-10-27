# TODO: Implement Real Puppeteer Automation Flow in Task Runner

## Tasks

- [ ] Import necessary functions from login-manager.ts (handleTOS, handleSplash, etc.)
- [ ] Add helper functions for quota checking, prompt input, duration/aspect selection, run button click, generation waiting, and video download
- [ ] Replace simulated code in runAccountTasks with real automation steps
- [ ] Implement login flow: navigate to aistudio.google.com/generate-video
- [ ] Implement quota check: parse remaining quota from page, skip if 0
- [ ] Implement TOS/saving handling if needed
- [ ] Implement prompt/image input based on task type
- [ ] Implement duration and aspect ratio selection
- [ ] Implement run button click and generation waiting
- [ ] Implement video download and saving to specified path
- [ ] Handle quota exhaustion and move to next account
- [ ] Add proper error handling and logging throughout the flow
- [ ] Test the complete flow with a single account/task

## Enable Saving Button Handling

- [x] Add handleEnableSaving function in login-manager.ts to find and click "enable saving" button, handle popup, and select account
- [x] Modify handleOne function to call handleEnableSaving after handleDriveAccess
- [ ] Test the updated login flow to ensure enable saving is handled correctly
