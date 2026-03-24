interface SendPaymentReceiptEmailParams {
  to: string;
  courseTitle: string;
  amount: number;
  currency: string;
  paymentId: string;
  provider: "mock" | "stripe";
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export async function sendPaymentReceiptEmail({
  to,
  courseTitle,
  amount,
  currency,
  paymentId,
  provider,
}: SendPaymentReceiptEmailParams): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !resendFromEmail || !to) {
    return;
  }

  const formattedAmount = formatCurrency(amount, currency);
  const subject = `[Empire LMS] Payment Receipt - ${courseTitle}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin-bottom: 12px;">Payment Receipt</h2>
      <p style="margin: 0 0 8px;">Thanks for your purchase. Your enrollment is now active.</p>
      <table style="border-collapse: collapse; margin-top: 12px;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Course</strong></td><td>${courseTitle}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Amount</strong></td><td>${formattedAmount}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Payment ID</strong></td><td>${paymentId}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Provider</strong></td><td>${provider}</td></tr>
      </table>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed (${response.status}): ${body}`);
  }
}
