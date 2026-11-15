# Calendar

Leonidas shows your events on **Today** and on the **Up next** card. It only reads your calendar. It
never changes it. There are two ways to connect a calendar.

## Paste a calendar link (works with any app)

1. Open **Settings → Browser → Calendars**, or click **Connect a calendar** on Today.
2. Pick your app (Google Calendar, Outlook, Apple iCloud or Other). Follow the steps on screen to
   copy your private calendar link.
3. Paste the link. It can start with `https://` or `webcal://`.
4. Click **Test**. You see "Found N events" when the link works.
5. Give the calendar a name and a color. Click **Save calendar**.

You can connect more than one calendar. To remove one, click the bin icon next to it in
**Settings → Browser → Calendars**.

A calendar link is a secret. Anyone who has it can read your calendar. Leonidas keeps it on your
computer and never shows it again after you save it. If a link leaks, make a new one in your
calendar app. Then remove the old calendar here and add the new link.

Leonidas reads each calendar again every 15 minutes.

## Sign in with Google

This lets you pick from your Google calendars without copying a link. Google asks every app that
does this to use its own client ID. You make one once. It is free and takes about five minutes.

### Set up (once)

1. Go to <https://console.cloud.google.com> and sign in. Create a project. Name it `Leonidas`.
2. Open **APIs & Services → Library**. Search for **Google Calendar API**. Click **Enable**.
3. Open **APIs & Services → OAuth consent screen** (it may say **Google Auth Platform**).
   - Choose **External**. Enter the app name `Leonidas` and your email.
   - Under **Data Access**, add the scope `https://www.googleapis.com/auth/calendar.readonly`.
   - Under **Audience**, click **Publish app**. If you leave it in **Testing**, Google ends your
     sign-in after 7 days. You will see a "Google hasn't verified this app" page when you sign in.
     Click **Advanced**, then **Go to Leonidas**. This is normal for your own app.
4. Open **APIs & Services → Credentials**. Click **Create credentials → OAuth client ID**.
   - For **Application type**, choose **Desktop app**. Name it `Leonidas`. Click **Create**.
   - Copy the **Client ID** and the **Client secret**.
5. In Leonidas, click **Connect a calendar**, then **Sign in with Google**. Paste the Client ID and
   the Client secret. Click **Save client ID**.

You can also set the two values as environment variables before you start Leonidas:
`LEONIDAS_GOOGLE_CLIENT_ID` and `LEONIDAS_GOOGLE_CLIENT_SECRET`.

### Sign in

1. Click **Sign in with Google**. A browser window opens on the computer that runs Leonidas.
2. Choose your account. Allow **See and download any calendar you can access using your Google
   Calendar**. This is read-only.
3. Go back to Leonidas. Tick the calendars to show. Click **Add**.

Leonidas keeps the sign-in on your computer. To sign out, remove the Google calendars in
**Settings → Browser → Calendars**. You can also remove the app at
<https://myaccount.google.com/permissions>.
