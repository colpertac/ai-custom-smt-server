/**
 * Plain HTML email templates. Add a file here → export below → thin
 * lib/email/send-*.ts helper → call from a Route Handler (often via after()).
 */

export { welcomeEmailTemplate, type WelcomeEmailProps } from "./Welcome"
export {
  resetPasswordTemplate,
  type ResetPasswordProps,
} from "./ResetPassword"
