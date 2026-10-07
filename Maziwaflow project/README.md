# Core UI Foundation

Goal: Build the foundational UI structure, lock in the design system, and establish the main dashboard.

Lovable Prompt Strategy:

Prompt Example: "Create a fully dynamic web and mobile-optimized dashboard titled 'Maziwaflow Mobile' featuring a deep blue header bar and a rounded central white container card. Inside the card, build stacked pill-shaped buttons with exact labels and colors: 'Receive Milk' (Green), 'Change Password' (Purple), 'Enquiries' (Orange), 'View Collections' (Soft Purple/Blue), and 'Logout' (Dark Brown). Include a pink floating help button (?) at the bottom right."

Pro Tip (Theme & Color Locking): Explicitly state your exact color scheme in this opening prompt. This locks your design rules (backgrounds, buttons, cards, and accent colors) so Lovable doesn't drift into mismatched styles as you add more views later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3cd49a99-251d-4bce-bfd5-4e83d3f5552a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## M-Pesa Daraja 3.0

The Payments screen supports two distinct transaction directions:

- **Send farmer payout (B2C):** sends money from the configured business shortcode to the farmer's registered phone number for an eligible payment record.
- **Request payment (STK Push):** prompts the entered phone to pay the configured business shortcode. This does not send a farmer payout.

Configure these values as Supabase Edge Function secrets; never put Daraja credentials in client-side environment variables or commit them:

| Secret                                           | Purpose                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `MPESA_ENVIRONMENT`                              | `sandbox` or `production`                                              |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET`   | Daraja OAuth client credentials                                        |
| `MPESA_SHORTCODE`                                | Registered business shortcode                                          |
| `MPESA_PASSKEY`                                  | STK Push passkey                                                       |
| `MPESA_CALLBACK_URL`                             | HTTPS URL for the `mpesa-callback` Edge Function, used by STK Push     |
| `MPESA_CALLBACK_SECRET`                          | Long random secret appended to the callback URLs                       |
| `MPESA_INITIATOR_NAME`                           | Daraja B2C initiator name                                              |
| `MPESA_SECURITY_CREDENTIAL`                      | Daraja-encrypted B2C initiator credential for the selected environment |
| `MPESA_B2C_RESULT_URL` / `MPESA_B2C_TIMEOUT_URL` | HTTPS callback URL for `mpesa-callback`                                |

For example, the callback URLs use `https://<project-ref>.supabase.co/functions/v1/mpesa-callback`. Configure the Daraja sandbox first and use its matching shortcode, passkey, and encrypted security credential. Production credentials and B2C permissions must be enabled by Safaricom before setting `MPESA_ENVIRONMENT=production`.

Deploy `mpesa-stk-push`, `mpesa-b2c-payout`, and `mpesa-callback` with the matching database migration. Validate successful, declined, cancelled, and delayed callbacks in the Daraja sandbox before enabling payouts. A B2C request that times out after submission is intentionally left pending to avoid accidentally sending a duplicate payout.
