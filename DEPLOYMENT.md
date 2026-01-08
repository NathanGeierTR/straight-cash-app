# Deployment Guide for Straight Cash App

## Setup GitHub Pages

1. **Enable GitHub Pages in your repository:**
   - Go to your repo on GitHub: `https://github.com/NathanGeierTR/straight-cash-app`
   - Click **Settings** → **Pages** (left sidebar)
   - Under **Source**, select **GitHub Actions**

2. **Push your code to trigger deployment:**
   ```bash
   cd /Users/a6064800/git/straight-cash-app
   git add .
   git commit -m "Add GitHub Pages deployment"
   git push origin main
   ```

3. **Monitor the deployment:**
   - Go to **Actions** tab in your GitHub repo
   - Watch the "Deploy to GitHub Pages" workflow run
   - Takes about 2-3 minutes

4. **Access your deployed app:**
   - Once deployed, your app will be at:
   - `https://NathanGeierTR.github.io/straight-cash-app/`

## Local Testing

Before deploying, test the production build locally:

```bash
cd /Users/a6064800/git/straight-cash-app
npm run build -- --configuration production --base-href /straight-cash-app/
npx http-server dist/straight-cash-app/browser -o
```

## Troubleshooting

**404 on routes:** Angular routing needs a catch-all. GitHub Pages handles this automatically when using the Actions deployment method.

**Assets not loading:** Make sure `base-href` matches your repo name in the build command.

**Build fails:** Check the Actions tab for error logs.

## Custom Domain (Optional)

If you want to use a custom domain:
1. Add a `CNAME` file to `straight-cash-app/src/` with your domain
2. Configure DNS with your domain registrar
3. Update GitHub Pages settings to use custom domain
