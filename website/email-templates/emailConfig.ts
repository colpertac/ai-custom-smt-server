/**
 * Shared styling for transactional emails (SMT gold / slate).
 * Plain HTML string factories — no Resend imports here.
 */

import { getEmailBranding } from "@/lib/email/branding"

export const emailConfig = {
  get appName() {
    return getEmailBranding().appName
  },
  get appUrl() {
    return getEmailBranding().appUrl
  },

  colors: {
    primary: "#d3b800",
    primaryHot: "#f0d24a",
    success: "#28a745",
    danger: "#c62828",
    text: "#e8ecf4",
    textSecondary: "#a8b0c0",
    textMuted: "#7a8499",
    background: "#0a0c10",
    panel: "#141c2b",
    white: "#ffffff",
    border: "#2a3548",
    alertBg: "#2a2410",
    dangerBg: "#2a1515",
  },

  baseStyles: `
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #e8ecf4;
      background-color: #0a0c10;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #141c2b;
      padding: 20px 0 48px;
      margin-bottom: 64px;
    }
    .box { padding: 0 40px; }
    .header {
      text-align: center;
      border-bottom: 2px solid #d3b800;
      padding: 16px 0 24px 0;
      margin-bottom: 24px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #f0d24a;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .heading {
      color: #f0d24a;
      font-size: 28px;
      font-weight: bold;
      line-height: 36px;
      text-align: center;
      margin: 24px 0;
    }
    .paragraph {
      color: #a8b0c0;
      font-size: 16px;
      line-height: 24px;
      text-align: left;
      margin: 16px 0;
    }
    .list-item {
      color: #a8b0c0;
      font-size: 16px;
      line-height: 24px;
      margin: 8px 0;
    }
    .button {
      border-radius: 4px;
      color: #0a0c10 !important;
      font-size: 16px;
      font-weight: bold;
      text-decoration: none;
      text-align: center;
      display: inline-block;
      padding: 12px 24px;
      margin: 24px 0;
      background-color: #d3b800;
    }
    .hr {
      border: none;
      border-top: 1px solid #2a3548;
      margin: 20px 0;
    }
    .link-text {
      color: #f0d24a;
      font-size: 12px;
      line-height: 16px;
      word-break: break-all;
      background-color: #1e293e;
      padding: 10px;
      border-radius: 4px;
    }
    .warning-box {
      background-color: #2a1515;
      border: 1px solid #c62828;
      border-radius: 4px;
      color: #ff9999;
      font-size: 14px;
      line-height: 20px;
      padding: 12px;
      margin: 16px 0;
    }
    .footer-divider {
      border-top: 1px solid #2a3548;
      margin-top: 32px;
      padding-top: 24px;
    }
    .footer-text {
      color: #7a8499;
      font-size: 12px;
      line-height: 16px;
      text-align: center;
      margin: 0;
    }
  `,
}

export const getEmailHead = (additionalStyles = ""): string => `
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        ${emailConfig.baseStyles}
        ${additionalStyles}
      </style>
    </head>
  `

export const getEmailHeader = (): string => `
    <div class="header">
      <p class="logo">${emailConfig.appName}</p>
    </div>
  `

export const getEmailFooter = (): string => `
    <div class="footer-divider">
      <p class="footer-text">
        <a href="${emailConfig.appUrl}" style="color: #f0d24a; text-decoration: none;">${emailConfig.appUrl}</a>
      </p>
    </div>
  `
