"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function checkPin(formData: FormData) {
  const pin = formData.get("pin") as string;

  if (pin === process.env.LIFTLOG_PIN) {
    const jar = await cookies();
    jar.set("liftlog_pin", pin, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/");
  }

  redirect("/pin?error=1");
}
