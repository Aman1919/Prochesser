import { Request, Response } from "express";
import path from "path";
import {
  captureOrder,
  createOrder,
  createPayout,
  generateAccessToken,
  generateClientToken,
} from "../../utils/paypal";
import axios from "axios";
import { PAYPAL_BASE, PLATFORM_FEES, WEBHOOK_ID } from "../../constants";
import { db } from "../../db";
import { processCommissionDeposit } from "../../controllers/payments/mpesa";
import { withdrawalChecks } from "../../utils/payment";

export const getURL = async (req: Request, res: Response) => {
  try {
    res.status(200).json({
      message: "Success",
    });
  } catch (error) {
    console.error("Error Sending Paypal URL:", error);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
};

export const getPaypentPage = async (req: Request, res: Response) => {
  res.sendFile(path.resolve("./client/index.html"));
};

// return client token for hosted-fields component
export const getToken = async (req: Request, res: Response) => {
  try {
    const { jsonResponse, httpStatusCode } = await generateClientToken();
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to generate client token:", error);
    res.status(500).send({ error: "Failed to generate client token." });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    // use the cart information passed from the front-end to calculate the order amount detals
    const { cart } = req.body;
    const user: any = (req?.user as any)?.user;
    const { jsonResponse, httpStatusCode } = await createOrder(cart);
    console.log("jsonResponse", jsonResponse);
    console.log("httpStatusCode", httpStatusCode);
    try {
      const orderId = jsonResponse?.id;
      const finalamountInUSD = Number(cart?.value);
      const platform_charges = parseFloat(
        (finalamountInUSD * PLATFORM_FEES).toFixed(2)
      );

      await db.transaction.create({
        data: {
          user: {
            connect: {
              id: user.id,
            },
          },
          amount: Number(cart?.value),
          type: "DEPOSIT",
          status: "PENDING",
          signature: "",
          checkout_id: "",
          api_ref: orderId,
          currency: "USD",
          finalamountInUSD: finalamountInUSD - platform_charges,
          platform_charges,
          // secret_token: encrpted_secret_token, // TODO: Bcrypt this before saving
          mode: "paypal",
        },
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ error: "Failed to add record in transaction." });
    }
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
};

export const getOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderID } = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);

    console.log("jsonResponse", jsonResponse);
    console.log("httpStatusCode", httpStatusCode);

    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
};

export const handlePayPalWebhook = async (req: Request, res: Response) => {
  try {
    console.log(
      "--------------------------------------------Triggering Paypal webhook------------------------------------"
    );

    // Verify the webhook signature
    const signature = req.headers["paypal-transmission-sig"];
    const transmissionId = req.headers["paypal-transmission-id"];
    const transmissionTime = req.headers["paypal-transmission-time"];
    const webhookId = WEBHOOK_ID;

    if (!signature || !transmissionId || !transmissionTime || !webhookId) {
      console.log("Missing PayPal headers");
      console.log("signature", signature);
      console.log("transmissionId", transmissionId);
      console.log("transmissionTime", transmissionTime);
      console.log("webhookId", webhookId);
      return res.status(400).send({ error: "Missing PayPal headers" });
    }

    if (!req.body) {
      console.log(JSON.stringify(req.body, null, 2));
      return res.status(400).send({ error: "Missing PayPal body" });
    }

    const headers = req.headers;
    const event = req.body;
    // const data = JSON.parse(event);

    console.log(`headers`, headers);
    console.log(`parsed json`, JSON.stringify(event, null, 2));
    console.log(`raw event: ${event}`);

    // const isSignatureValid = await verifySignature(event, headers);
    let verificationResponse: any;

    try {
      verificationResponse = await axios.post(
        `${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`,
        {
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: req.headers["paypal-cert-url"],
          auth_algo: req.headers["paypal-auth-algo"],
          transmission_sig: signature,
          webhook_id: webhookId,
          webhook_event: req.body,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await generateAccessToken()}`,
          },
        }
      );
    } catch (error) {
      console.log("Error in validating response", error);
      return res.status(500).json({
        status: "error",
        message: "Something went wrong while validation",
      });
    }

    console.log("verificationResponse", verificationResponse);

    const isSignatureValid =
      verificationResponse?.data?.verification_status === "SUCCESS";

    console.log(isSignatureValid, "isSignatureValid");
    if (isSignatureValid) {
      console.log("Signature is valid.");

      // Successful receipt of webhook, do something with the webhook data here to process it, e.g. write to database
      console.log(`Received event`, JSON.stringify(event, null, 2));
      // Write logic to update the balance of the user if not updated already

      // Check for api_ref and match it
      const capture = event.resource;
      const orderId = capture.id;
      const status: string = (capture?.status ?? capture?.state).toString();
      // const orderId = capture.supplementary_data.related_ids.order_id;

      const transaction = await db.transaction.findFirst({
        where: {
          api_ref: orderId,
          type: "DEPOSIT",
        },
        select: {
          id: true,
          userId: true,
          finalamountInUSD: true,
          status: true,
          platform_charges: true,
          secret_token: true,
        },
      });

      if (!transaction) {
        console.log("Transaction not found");
        return res
          .status(404)
          .json({ message: "Transaction not found", status: "error" });
      }

      console.log("Transaction for deposit found -> ", transaction);

      if (
        event.event_type === "PAYMENT.CAPTURE.DENIED" ||
        event.event_type === "PAYMENT.CAPTURE.REFUNDED" ||
        event.event_type === "PAYMENT.CAPTURE.DECLINED" ||
        ["denied", "declined"].includes(status?.toLowerCase())
      ) {
        console.log(
          "Updating DB..",
          "Transaction",
          transaction.id,
          "has been CANCELLED"
        );

        await db.transaction.update({
          where: { id: transaction.id },
          data: {
            status: "CANCELLED",
          },
        });

        return res.status(400).json({
          message: `Status is ${event.event_type}`,
          status: "error",
        });
      }

      if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
        console.log("Payment is", event.event_type);

        return res.status(400).json({
          message: `Status is ${event.event_type}`,
          status: "error",
        });
      }

      // Check for if the transaction is pending
      if (transaction.status !== "PENDING") {
        console.log(
          "Transaction already completed with status -> ",
          transaction.status
        );
        return res.status(401).json({
          message: "Transaction already completed or cancelled",
          status: "error",
        });
      }

      // Update transaction it as successful
      console.log(
        "Updating DB and balance by",
        transaction.finalamountInUSD,
        "Transaction",
        transaction.id,
        "has been COMPLETED"
      );

      await db.$transaction([
        db.user.update({
          where: {
            // email: user.email,
            id: transaction.userId,
          },
          data: {
            balance: {
              increment: transaction.finalamountInUSD,
            },
          },
        }),
        db.transaction.update({
          where: { id: transaction.id },
          data: {
            status: "COMPLETED", // Mark transaction as completed
          },
        }),
        ...((await processCommissionDeposit(
          transaction.userId,
          transaction.finalamountInUSD - transaction.platform_charges
        )) || []), // Process the commission if there's a referrer
      ]);

      console.log("Payment Completed");
      res.status(200).json({
        message: "Payment Successful",
      });
    } else {
      console.log(
        `Signature is not valid for ${req.body?.id} ${headers?.["correlation-id"]}`
      );
      console.log("User not authorized");
      return res.status(400).json({
        status: "error",
        message: "User is unauthorized",
      });
      // Reject processing the webhook event. May wish to log all headers+data for debug purposes.
    }

    // Return a 200 response to mark successful webhook delivery
    res.status(200).json({
      success: "true",
      message: "Webhook success",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: "false",
      message: "internal Server Error",
      event,
    });
  }
};

export const handlePaypalPayout = async (req: Request, res: Response) => {
  try {
    let { email, amount, currency } = req.body;
    amount = Number(amount);
    const user: any = (req?.user as any)?.user;
    const currentBalance = user?.balance;

    if (!amount || !currency || !email)
      return res.status(404).json({
        status: "error",
        message: "Please provide amount, currency, email",
      });

    const withdrawalCheck = await withdrawalChecks(
      amount,
      amount,
      email,
      currentBalance,
      user
    );

    if (!withdrawalCheck.status) {
      return res.status(400).json({
        status: false,
        message: withdrawalCheck.message,
      });
    }

    const platform_charges = amount * PLATFORM_FEES;
    const transaction = await db.transaction.create({
      data: {
        userId: user.id,
        amount: amount,
        type: "WITHDRAWAL",
        status: "REQUESTED",
        // TODO: Temporary change
        signature: "",
        checkout_id: "",
        finalamountInUSD: amount - platform_charges,
        platform_charges,
        mode: "paypal",
        wallet_address: email,
      },
    });

    return res.status(200).json({
      message: "Money withdrawal initiated! Kindly wait till it is approved.",
      transaction, // Return the transaction object
    });

    // const recipientEmail = user?.email;
    // const response = await createPayout(recipientEmail, amount, currency);
    // res.status(200).json(response);
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: "false",
      message: "internal Server Error",
    });
  }
};
