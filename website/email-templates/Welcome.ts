import {
  getEmailFooter,
  getEmailHead,
  getEmailHeader,
} from "./emailConfig"

export type WelcomeEmailProps = {
  userName: string
  accountUrl: string
  downloadUrl: string
}

export const welcomeEmailTemplate = (props: WelcomeEmailProps): string => `
<!DOCTYPE html>
<html>
  ${getEmailHead()}
  <body>
    <div class="container">
      <div class="box">
        ${getEmailHeader()}
        <p class="heading">Welcome, ${props.userName}</p>
        <p class="paragraph">
          Your account is ready. Sign in on the portal anytime to manage your
          profile, and use the same username and password in the game client.
        </p>
        <a href="${props.accountUrl}" class="button">Open account</a>
        <hr class="hr" />
        <p class="list-item">Download the client and updater from the portal</p>
        <p class="list-item">Keep this email if you set a recovery address</p>
        <p class="paragraph">
          <a href="${props.downloadUrl}" style="color: #f0d24a;">Get the client</a>
        </p>
        ${getEmailFooter()}
      </div>
    </div>
  </body>
</html>
`
