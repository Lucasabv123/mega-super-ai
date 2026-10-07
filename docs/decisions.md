# Decisions

What I found out about using my ChatGPT Plus and Claude Pro plans in my own app.

## OpenAI (ChatGPT)

Source: https://developers.openai.com/siwc/token-sharing-open-source

**1. Can my own app on my Mac use my ChatGPT plan?**
Yes. OpenAI allows it for open-source apps and apps that run locally on your own computer. I don't need to ask for approval. Only paid or online-hosted apps need to fill out a form.

**2. Does my Plus plan work?**
Not sure yet. The docs don't say which plans work. I'll find out when I sign in: if OpenAI gives my app the `chatgpt.tokens.use.direct` permission, it works.

**3. What is a host ID?**
Source: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
It's a name tag for my app on this computer, like `urn:uuid:1234...`. My app has to make it once, save it, and send the same one every time I sign in. That way OpenAI knows it's the same app on the same computer.

**4. What permissions do I need, and what is PKCE?**
I ask for these permissions when I sign in:
- `openid profile email` = who I am
- `offline_access` = stay signed in without logging in again
- `resource.invoke` and `chatgpt.tokens.use.direct` = use my ChatGPT plan to send messages

Asking isn't enough. After I sign in, I have to check that OpenAI actually gave me `chatgpt.tokens.use.direct`.

PKCE ("pixie") is a secret my app makes up before sign-in. Only my app knows it. If someone steals the sign-in code on the way back to my app, they can't use it without the secret.

## Claude

Source: https://code.claude.com/docs/en/legal-and-compliance

**5. Can my app log in with my Claude Pro account?**
No. Anthropic doesn't let apps build their own Claude login or touch Claude login tokens. Apps you build (even with the Agent SDK) are supposed to use a paid API key.
What *is* allowed: using the real Claude Code program and logging in to it myself.

**6. What will I do for Claude?**
I'll try using Claude Code as a bridge. My app runs the `claude` command on my Mac, and Claude Code handles the login, so my app never touches my password or tokens.
This is my own reading of the rules for one person using their own account. The docs don't say it word for word. If it doesn't work, my backup options are paying for an API key or leaving Claude out for now.

**Plan:** get OpenAI working first, then Claude.
