# GitHub AI Chat Widget

## Overview
The GitHub AI Chat Widget integrates GitHub's AI Models service (powered by GPT-4 and other models) directly into your dashboard. This allows you to have intelligent conversations with AI assistants without leaving your application.

## Features

✅ **Multiple AI Models**: Support for GPT-4o, GPT-4o-mini, GPT-4-turbo, and GPT-3.5-turbo
✅ **Conversation History**: Automatically saves your chat history locally
✅ **Real-time Chat**: Instant responses from AI models
✅ **Secure Configuration**: Uses GitHub Personal Access Tokens for authentication
✅ **Connection Testing**: Built-in tool to verify your token works
✅ **Suggested Prompts**: Quick-start prompts to help you get started
✅ **Responsive Design**: Works great on desktop and mobile

## Setup Instructions

### 1. Create a GitHub Personal Access Token (PAT)

1. Visit [GitHub Token Settings](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"** (fine-grained token)
3. Give your token a descriptive name (e.g., "Straight Cash AI Chat")
4. Set expiration (recommended: 90 days or custom)
5. **Required Permissions**:
   - **Account permissions** → Model inference: **Read** access
6. Click **"Generate token"**
7. **Copy the token immediately** (it won't be shown again)

### 2. Configure the Widget

1. Open your dashboard
2. Find the **"GitHub AI Assistant"** widget
3. Click the **gear icon** (⚙️) to open settings
4. Paste your Personal Access Token
5. Select your preferred AI model (GPT-4o recommended)
6. Click **"Test Connection"** to verify it works
7. Click **"Save Configuration"**

### 3. Start Chatting!

- Type your message in the input box at the bottom
- Press **Enter** to send (or click the send button)
- Use **Shift+Enter** for new lines
- Try the suggested prompts to get started quickly

## Usage Examples

### Code Help
```
"Help me debug this TypeScript error..."
"Explain how async/await works in JavaScript"
"Write a function to sort an array of objects"
```

### Documentation
```
"Help me write user stories for a new feature"
"Generate API documentation for this endpoint"
"Create a README template for my project"
```

### Problem Solving
```
"What are best practices for API design?"
"How can I optimize this database query?"
"Explain the difference between REST and GraphQL"
```

## Features Explained

### Conversation History
- Chat history is automatically saved to your browser's local storage
- Your conversations persist across page refreshes
- Clear history anytime with the trash icon

### Model Selection
- **GPT-4o**: Latest and most capable model (recommended)
- **GPT-4o-mini**: Faster, more cost-effective for simpler tasks
- **GPT-4-turbo**: High performance for complex reasoning
- **GPT-3.5-turbo**: Fast responses for straightforward questions

### Keyboard Shortcuts
- **Enter**: Send message
- **Shift+Enter**: New line in message
- **Esc**: Close configuration panel (when open)

## Security Notes

### Token Safety
- ✅ Tokens are stored in your browser's local storage only
- ✅ Never shared with any third party
- ✅ Only used to authenticate with GitHub's official API
- ⚠️ Don't share your token with others
- ⚠️ Regenerate your token if you suspect it's compromised

### Token Permissions
The widget only requires:
- **Read access to Model inference**

No other permissions are needed or requested.

## Troubleshooting

### "Invalid or expired GitHub Personal Access Token"
- Verify your token hasn't expired
- Check that you granted "Model inference" read access
- Generate a new token if needed

### "Rate limit exceeded"
- GitHub has API rate limits
- Wait a few minutes and try again
- Consider upgrading to GitHub Pro for higher limits

### "Connection test failed"
- Check your internet connection
- Verify the token is copied correctly (no extra spaces)
- Ensure you're using a fine-grained token (not classic)

### Messages not appearing
- Check browser console for errors
- Try clearing configuration and setting up again
- Refresh the page

## API Information

The widget uses GitHub's Models API:
- **Endpoint**: `https://models.inference.ai.azure.com/chat/completions`
- **Authentication**: Bearer token (your PAT)
- **Format**: OpenAI-compatible API

## Privacy

- All conversations happen directly between your browser and GitHub
- No data is sent to any other third-party services
- Conversation history is stored locally in your browser
- Clear your browser data to remove all history

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify your GitHub token permissions
3. Try regenerating your token
4. Check GitHub's status page for API outages

## Limits

- **Token length**: Each model has different limits
  - GPT-4o: 4096 output tokens
  - GPT-3.5-turbo: 4096 output tokens
- **Rate limits**: Based on your GitHub plan
- **Conversation context**: Maintains full history within the widget

## Tips for Best Results

1. **Be specific**: Clear, detailed questions get better answers
2. **Provide context**: Include relevant details about your problem
3. **Iterate**: Ask follow-up questions to refine responses
4. **Use code blocks**: Paste code snippets for help with debugging
5. **Try different models**: Some models excel at different tasks

## Future Enhancements

Potential features for future versions:
- Export conversation history
- Code syntax highlighting in responses
- File attachment support
- Multiple conversation threads
- Team sharing capabilities
- Custom system prompts
