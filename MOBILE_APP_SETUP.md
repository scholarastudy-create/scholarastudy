# 📱 Scholara Mobile App Setup Guide

This guide will walk you through converting your Scholara website into a native iOS app for the App Store.

## 🎯 Overview

We're using **Capacitor** to wrap your existing website into a native iOS app. This means:
- ✅ No need to rewrite your entire app
- ✅ Update the website = update the app
- ✅ Can publish to App Store (iOS) AND Google Play (Android)
- ✅ Access native features (camera, push notifications, etc.)

---

## 📋 Prerequisites

### Required Software
1. **Mac Computer** (required for iOS development)
2. **Xcode** (latest version from Mac App Store)
3. **Node.js** (v16 or higher)
4. **npm** (comes with Node.js)
5. **CocoaPods** (install with: `sudo gem install cocoapods`)

### Required Accounts
1. **Apple Developer Account** ($99/year)
   - Sign up at: https://developer.apple.com
2. **App Store Connect Account** (included with Apple Developer)

---

## 🚀 Step 1: Install Dependencies

```bash
cd /path/to/scholarastudy
npm install
```

This installs Capacitor and all required dependencies.

---

## 🏗️ Step 2: Initialize Capacitor iOS Project

```bash
# Initialize Capacitor (if not already done)
npx cap init

# Add iOS platform
npx cap add ios

# Copy web files to native project
npx cap copy ios

# Sync changes
npx cap sync ios
```

This creates the `ios/` folder with your Xcode project.

---

## 📱 Step 3: Open in Xcode

```bash
npx cap open ios
```

This opens your project in Xcode.

### In Xcode:

1. **Select your Team**
   - Click on the project name (Scholara) in the left sidebar
   - Go to "Signing & Capabilities" tab
   - Select your Apple Developer team from dropdown

2. **Update Bundle Identifier**
   - Change from `com.scholara.study` to your unique ID
   - Example: `com.yourname.scholara`

3. **Set Deployment Target**
   - Minimum iOS version: **iOS 13.0** or higher
   - This determines which iOS versions can install your app

4. **Configure App Icons** (see Step 5)

---

## 🎨 Step 4: Update App Metadata

### In `capacitor.config.json`:
- `appId`: Your unique bundle identifier (e.g., `com.scholara.study`)
- `appName`: "Scholara" (appears under app icon)

### In Xcode:
1. Click on project name → General tab
2. **Display Name**: "Scholara"
3. **Version**: "1.0.0" (your app version)
4. **Build**: "1" (increment for each submission)

---

## 🖼️ Step 5: Create App Icons & Splash Screens

### App Icons (Required)

You need icons in these sizes for iOS:
- 1024×1024 (App Store)
- 180×180 (iPhone)
- 167×167 (iPad Pro)
- 152×152 (iPad)
- 120×120 (iPhone)
- 87×87 (iPhone)
- 80×80 (iPad)
- 76×76 (iPad)
- 60×60 (iPhone)
- 58×58 (iPad)
- 40×40 (iPad)
- 29×29 (Settings)
- 20×20 (Notification)

**Easy Solution:**
1. Create ONE high-res logo (2048×2048 px)
2. Use this free tool: https://www.appicon.co
3. Upload your logo, download iOS icon set
4. In Xcode: Select `Assets.xcassets` → `AppIcon` → Drag icons into slots

### Splash Screen (Optional but Recommended)

Create a simple splash screen:
- Background color: `#E8A735` (Scholara gold)
- White "Scholara" text or logo
- Recommended size: 1242×2688 px (iPhone size)

Add to Xcode:
1. `Assets.xcassets` → Right-click → "New Image Set"
2. Name it "Splash"
3. Drag your splash image

---

## 🔧 Step 6: Configure App Permissions

Your app needs permissions for certain features. Add these to `Info.plist` in Xcode:

### Camera Access (for ScholarAI file uploads)
```xml
<key>NSCameraUsageDescription</key>
<string>Scholara needs camera access to upload photos of your notes and study materials.</string>
```

### Photo Library Access
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>Scholara needs access to your photos to upload study materials.</string>
```

To add these:
1. In Xcode, click on `Info.plist`
2. Click "+" to add new rows
3. Copy/paste the keys and values above

---

## 🧪 Step 7: Test on Simulator

```bash
# Open in Xcode
npx cap open ios

# Then in Xcode:
# 1. Select a simulator (e.g., "iPhone 14 Pro")
# 2. Click the ▶️ Play button
# 3. Wait for simulator to launch
```

Your app should open in the iOS Simulator!

### Test these features:
- ✅ Login/signup
- ✅ Navigation between pages
- ✅ ScholarAI chat
- ✅ File uploads
- ✅ Payment flow (use Stripe test mode)

---

## 📲 Step 8: Test on Real Device

1. Connect your iPhone via USB
2. In Xcode, select your iPhone from device dropdown (next to ▶️)
3. Click ▶️ to build and run
4. **First time:** You'll need to trust your developer certificate
   - On iPhone: Settings → General → VPN & Device Management
   - Tap your Apple ID → Trust

---

## 📦 Step 9: Build for App Store Submission

### 1. Archive the App
```
In Xcode:
1. Select "Any iOS Device (arm64)" from device dropdown
2. Menu: Product → Archive
3. Wait for build to complete
4. Organizer window opens automatically
```

### 2. Validate the Archive
```
1. Select your archive
2. Click "Validate App"
3. Choose your team and signing options
4. Fix any issues that appear
```

### 3. Distribute to App Store
```
1. Click "Distribute App"
2. Select "App Store Connect"
3. Choose "Upload"
4. Select your team and signing certificate
5. Click "Upload"
```

---

## 🎯 Step 10: App Store Connect Setup

### 1. Create App Listing
1. Go to: https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - **Platform**: iOS
   - **Name**: Scholara
   - **Primary Language**: English
   - **Bundle ID**: (select your app's bundle ID)
   - **SKU**: SCHOLARA001 (any unique identifier)

### 2. App Information
- **Name**: Scholara
- **Subtitle**: Study Smarter, Not Harder
- **Category**:
  - Primary: Education
  - Secondary: Productivity
- **Privacy Policy URL**: https://scholarastudy.com/privacy-policy.html
- **Support URL**: https://scholarastudy.com/contact.html

### 3. Pricing & Availability
- **Price**: Free
- **Availability**: All countries
- **In-App Purchases**: You'll add later for Pro/Premium plans

### 4. App Screenshots (REQUIRED)

You need screenshots for:
- **6.5" Display** (iPhone 14 Pro Max, etc.): 1290×2796 px
- **5.5" Display** (iPhone 8 Plus, etc.): 1242×2208 px

**How to capture:**
1. Run app on iPhone 14 Pro Max Simulator
2. Use simulator: Device → Screenshot (⌘+S)
3. Take 3-6 screenshots showing:
   - Login/home screen
   - Dashboard
   - ScholarAI chat
   - Study guide generation
   - Settings/features

### 5. App Description

**App Store Description (4000 char max):**
```
Transform your study experience with Scholara - the AI-powered study platform that helps you study smarter, not harder.

KEY FEATURES:

📚 AI Study Guides
Upload your notes or syllabus and get custom study guides in 24-48 hours. Our AI analyzes your materials and creates comprehensive study resources tailored to your needs.

🤖 ScholarAI Assistant
Chat with your personal AI tutor anytime. Get help with homework, essay writing, citations, and exam prep. Premium feature optimized for academic success.

📝 Professional Templates
Access resume, cover letter, and study templates designed to boost your academic and career success.

⚡ Fast & Easy
- Upload files in any format (PDF, DOCX, images)
- Get organized study materials in minutes
- Study on the go with our mobile app

💎 Flexible Plans
- FREE: 5 templates, basic features
- PRO ($5.99/mo): Custom study guides, all templates
- PREMIUM ($9.99/mo): ScholarAI assistant + everything in Pro

Perfect for high school students, college students, and lifelong learners.

SUBSCRIPTION INFO:
• Payment charged to iTunes Account at confirmation
• Auto-renews unless turned off 24 hours before period ends
• Manage subscriptions in Account Settings
• Privacy Policy: https://scholarastudy.com/privacy-policy.html
• Terms: https://scholarastudy.com/terms.html
```

**Keywords (100 char max):**
```
study,tutor,ai,homework,exam,notes,guide,school,college,education
```

### 6. Review Information
- **Contact Email**: scholara@gmail.com
- **Demo Account**: Create a test account for Apple reviewers
  - Email: `applereview@scholarastudy.com`
  - Password: Create a secure password
  - Make sure this account has Premium access!

### 7. Version Information
- **Version**: 1.0.0
- **Copyright**: 2025 Scholara
- **What's New**: "Initial release of Scholara mobile app"

---

## 🔄 Updating the App

When you make changes to your website:

```bash
# Copy updated files to iOS
npx cap copy ios

# Sync everything
npx cap sync ios

# Open in Xcode
npx cap open ios

# Update version/build number
# Build and submit new version
```

---

## 💰 In-App Purchases (IMPORTANT!)

Your Pro and Premium plans need to be set up as **In-App Purchases** or **Subscriptions**.

### Creating Subscriptions in App Store Connect:

1. Go to your app → Features → In-App Purchases
2. Click "+" → Auto-Renewable Subscription
3. Create Subscription Group: "Scholara Plans"
4. Add Subscriptions:

**Pro Monthly:**
- Product ID: `com.scholara.pro.monthly`
- Price: $5.99/month
- Display Name: "Pro Plan"
- Description: "Custom study guides and all templates"

**Pro Semester:**
- Product ID: `com.scholara.pro.semester`
- Price: $25.00 (duration: 6 months)

**Premium Monthly:**
- Product ID: `com.scholara.premium.monthly`
- Price: $9.99/month
- Display Name: "Premium Plan"
- Description: "ScholarAI assistant + everything in Pro"

**Premium Semester:**
- Product ID: `com.scholara.premium.semester`
- Price: $45.00 (duration: 6 months)

⚠️ **IMPORTANT**: You'll need to integrate StoreKit in your app to handle these purchases. This requires additional code changes.

---

## ⚠️ Common Issues & Solutions

### "No account with team ID found"
**Solution**: Make sure you're signed in to Xcode with your Apple Developer account
- Xcode → Settings → Accounts → Add your Apple ID

### "Failed to register bundle identifier"
**Solution**: Change your bundle ID to something unique
- In Xcode: Project → Signing & Capabilities → Bundle Identifier

### "Codesign wants to access key"
**Solution**: Click "Always Allow" - this is normal during development

### App crashes on launch
**Solution**: Check Console in Xcode for errors. Common causes:
- Missing permissions in Info.plist
- Invalid configuration in capacitor.config.json

---

## 📚 Additional Resources

- **Capacitor Docs**: https://capacitorjs.com/docs
- **App Store Guidelines**: https://developer.apple.com/app-store/review/guidelines/
- **Human Interface Guidelines**: https://developer.apple.com/design/human-interface-guidelines/
- **App Store Connect Help**: https://developer.apple.com/help/app-store-connect/

---

## ✅ Pre-Submission Checklist

Before submitting to App Store:

- [ ] App icons added (all sizes)
- [ ] Splash screen configured
- [ ] All permissions in Info.plist with descriptions
- [ ] Tested on iPhone Simulator
- [ ] Tested on real iPhone device
- [ ] Screenshots captured (6.5" and 5.5" displays)
- [ ] App Store description written
- [ ] Privacy policy URL working
- [ ] Support URL working
- [ ] Demo account created for Apple reviewers
- [ ] In-app purchases configured (if using)
- [ ] Version and build numbers set
- [ ] App validated in Xcode
- [ ] Uploaded to App Store Connect
- [ ] All metadata filled in App Store Connect

---

## 🎉 After Approval

Once Apple approves your app:

1. **Release**: Click "Release this version" in App Store Connect
2. **Monitor**: Check reviews and ratings
3. **Update**: Push updates as you improve the website
4. **Market**: Share your App Store link!

App Store link format:
`https://apps.apple.com/app/scholara/idXXXXXXXXX`

---

## 🆘 Need Help?

If you get stuck:
1. Check Xcode's Console for error messages
2. Review Capacitor docs: https://capacitorjs.com/docs
3. Search Stack Overflow for specific errors
4. Contact Apple Developer Support

---

**Good luck with your app submission! 🚀**

Generated with [Claude Code](https://claude.com/claude-code)
