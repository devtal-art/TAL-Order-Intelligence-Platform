// HTML template for the "Help" button's notification email (new, additive).
//
// This mirrors the user-supplied design (navy gradient header, HELP DESK
// pill, big bold heading, light-blue bordered details card with vertical
// divider lines, message box, two-column footer) — but rebuilt on
// table-based layout instead of the original CSS Grid/Flexbox.
//
// Why: the Grid/Flexbox version was verified against the actual Brevo send
// opened in real Gmail, and Gmail's rendering engine does not honor
// `display:grid`/`display:flex` in HTML email — the detail rows collapsed
// out of their columns and the header's flex button rendered oversized and
// misplaced. Tables are the one layout primitive every major mail client
// (Gmail, Outlook, Apple Mail) renders identically, so the same visual
// design is reproduced here with nested `<table>`s instead. A `<style>`
// media-query block (supported by Gmail/Apple Mail/mobile clients) still
// handles the phone-width adjustments from the original CSS.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildHelpEmailHtml({ senderName, message, submittedOn }) {
  const safeName = escapeHtml(senderName);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const safeWhen = escapeHtml(submittedOn);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Help Desk Notification</title>
<style>
  body{margin:0;padding:8px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;}
  table{border-collapse:collapse;}
  .divider{width:1px;font-size:0;line-height:0;background:#d7dee9;}

  @media only screen and (max-width:700px){
    .header-pad{padding:0 22px !important;}
    .content-pad{padding:18px 22px 0 !important;}
    .footer-pad{padding-left:22px !important;padding-right:22px !important;}
    .heading{font-size:21px !important;}
    .intro{font-size:13.5px !important;}
  }
  @media only screen and (max-width:520px){
    .header-pad{padding:14px 18px !important;}
    .header-title{font-size:15px !important;}
    .header-sub{font-size:11.5px !important;}
    .help-pill{padding:8px 14px !important;font-size:11px !important;}
    .content-pad{padding:16px 18px 0 !important;}
    .heading{font-size:19px !important;letter-spacing:-0.4px !important;}
    .intro{font-size:13px !important;}
    .detail-label{width:100px !important;font-size:12.5px !important;}
    .detail-value{font-size:12.5px !important;padding-left:14px !important;}
    .footer-pad{padding-left:18px !important;padding-right:18px !important;}
  }
  @media only screen and (max-width:390px){
    .detail-label{width:84px !important;}
    .detail-value{padding-left:11px !important;}
    .footer-stack-cell{display:block !important;width:100% !important;text-align:left !important;}
    .footer-note{border-left:0 !important;border-top:1px solid #cfd5df;padding:8px 0 0 !important;margin-top:8px;}
  }
</style>
</head>
<body style="margin:0;padding:8px;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e2e6eb;border-radius:6px;">
        <tr>
          <!-- Header -->
          <td class="header-pad" style="background-color:#304c8e;background-image:linear-gradient(110deg,#304c8e 0%,#2d4788 100%);padding:0 20px;border-radius:6px 6px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle" style="padding:16px 0;">
                  <div class="header-title" style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.25px;line-height:1.2;">Order Intelligence Platform</div>
                  <div class="header-sub" style="color:#dce5f8;font-size:12.5px;line-height:1.2;margin-top:3px;">Internal Operations Tool</div>
                </td>
                <td align="right" valign="middle" style="padding:16px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td class="help-pill" style="background-color:#6090e7;background-image:linear-gradient(135deg,#78a4f0,#6090e7);border-radius:28px;padding:9px 18px;">
                        <span style="color:#ffffff;font-size:12px;font-weight:700;white-space:nowrap;">HELP DESK</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <!-- Content -->
          <td class="content-pad" style="padding:20px 20px 0;">
            <div style="color:#7d8eac;font-size:11.5px;font-weight:700;line-height:1;margin-bottom:8px;">HELP DESK NOTIFICATION</div>
            <div class="heading" style="color:#080e1b;font-size:23px;font-weight:800;line-height:1.15;letter-spacing:-0.6px;">New help request received</div>
            <div class="intro" style="color:#70809b;font-size:14px;line-height:1.4;margin:6px 0 16px;">A teammate submitted a help request from the Order Intelligence Platform.</div>

            <!-- Details -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f8ff;background-image:linear-gradient(110deg,#f4f8ff 0%,#f2f6fd 100%);border:1px solid #cfe0ff;border-radius:8px;">
              <tr>
                <td style="padding:8px 18px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td class="detail-label" width="130" valign="middle" style="width:130px;color:#71809a;font-size:13px;line-height:1.3;padding:7px 0;">From</td>
                      <td class="divider" width="1" valign="middle"><div style="width:1px;height:20px;background:#d7dee9;">&nbsp;</div></td>
                      <td class="detail-value" valign="middle" style="color:#111827;font-size:13.5px;line-height:1.3;padding:7px 0 7px 18px;font-weight:600;">${safeName}</td>
                    </tr>
                    <tr>
                      <td class="detail-label" width="130" valign="middle" style="width:130px;color:#71809a;font-size:13px;line-height:1.3;padding:7px 0;">Submitted On</td>
                      <td class="divider" width="1" valign="middle"><div style="width:1px;height:20px;background:#d7dee9;">&nbsp;</div></td>
                      <td class="detail-value" valign="middle" style="color:#111827;font-size:13.5px;line-height:1.3;padding:7px 0 7px 18px;">${safeWhen}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Message -->
            <div style="color:#77869f;font-size:11.5px;font-weight:700;line-height:1;margin:16px 0 8px;">MESSAGE</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #d9dfe7;border-radius:8px;">
              <tr>
                <td style="padding:12px 18px;color:#141b28;font-size:13.5px;line-height:1.45;">${safeMessage}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <!-- Footer -->
          <td class="footer-pad" style="padding:0 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #dce1e8;margin-top:16px;">
              <tr>
                <td style="padding:14px 0 16px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td class="footer-stack-cell" valign="top">
                        <div style="color:#182b4e;font-size:13px;font-weight:700;line-height:1.2;">Order Intelligence Platform</div>
                        <div style="color:#78869e;font-size:11.5px;line-height:1.2;margin-top:2px;">Internal Operations Tool</div>
                      </td>
                      <td class="footer-stack-cell footer-note" align="right" valign="top" style="padding-left:20px;border-left:1px solid #cfd5df;color:#78869e;font-size:11.5px;line-height:1.2;white-space:nowrap;">
                        For internal use only.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
