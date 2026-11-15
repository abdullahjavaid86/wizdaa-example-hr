import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

const appUrl = process.env.APP_URL || "https://flip-voters-collaborative-clinton.trycloudflare.com";

describe("ExampleHR Time-Off App", () => {
  it("should render the login page with all required elements", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: appUrl });

    const headingResult = await testdriver.assert("the 'Sign in to TimeOff' heading is visible");
    expect(headingResult).toBeTruthy();

    const emailField = await testdriver.find("Email input field");
    expect(emailField).toBeTruthy();

    const passwordField = await testdriver.find("Password input field");
    expect(passwordField).toBeTruthy();

    const signInButton = await testdriver.find("Sign in button");
    expect(signInButton).toBeTruthy();
  });

  it("should allow entering credentials and handle submission", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({ url: appUrl });

    const emailField = await testdriver.find("Email input field");
    await emailField.click();
    await testdriver.type("employee@example.com");

    const passwordField = await testdriver.find("Password input field");
    await passwordField.click();
    await testdriver.type("password123");

    const signInBtn = await testdriver.find("Sign in button");
    await signInBtn.click();

    const assertResult = await testdriver.assert("an error message is displayed on the screen");
    expect(assertResult).toBeTruthy();
  });
});
