import {
  getEmailFooter,
  getEmailHead,
  getEmailHeader,
} from "./emailConfig"

export type ResetPasswordProps = {
  userName: string
  resetLink: string
  expiresIn: string
}

export const resetPasswordTemplate = ({
  userName,
  resetLink,
  expiresIn,
}: ResetPasswordProps): string => `
<!DOCTYPE html>
<html>
  ${getEmailHead()}
  <body>
    <div class="container">
      <div class="box">
        ${getEmailHeader()}
        <p class="heading">Reset your password</p>
        <p class="paragraph">Hi ${userName},</p>
        <p class="paragraph">
          We received a request to reset your portal / game account password.
          If you did not ask for this, you can ignore this email.
        </p>
        <a href="${resetLink}" class="button">Reset password</a>
        <hr class="hr" />
        <p class="paragraph">Or copy this link:</p>
        <p class="link-text">${resetLink}</p>
        <p class="paragraph" style="font-size: 14px; color: #7a8499;">
          This link expires in ${expiresIn}.
        </p>
        <p class="warning-box">
          Never share this link. Anyone with it can change your password until it expires.
        </p>
        ${getEmailFooter()}
      </div>
    </div>
  </body>
</html>
`
