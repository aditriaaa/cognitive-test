/*
 * consent.js — the consent, parental permission and assent forms.
 *
 * ************************************************************************
 *  DRAFT WORDING, NOT IRB/SRC-APPROVED. Written by Claude (AI) from the
 *  research plan, with reasonable choices where the plan says nothing (who
 *  sees the data, how long it is kept, contacts: Abhi asked for these on
 *  2026-11-24). When the IRB/SRC approves a form, put its exact text here,
 *  then set CONFIG.CONSENT.approved = true and change CONFIG.CONSENT.version.
 *  While approved is false, the form shows a DRAFT banner and real
 *  (non-dev) sign-ups are refused.
 * ************************************************************************
 *
 * Research plan: adults (18+) give written informed consent; minors give
 * written parental permission plus their own written assent. Here that is
 * ONE form for everyone (the participant signs; a parent or guardian also
 * signs if the participant is under 18). Forms describe
 * the purpose, number and length of sessions, the fatigue task, risks, the
 * right to withdraw, how data is stored, and that no diagnosis or score
 * feedback is given.
 *
 * Like the questionnaires, this wording must not change without a new
 * version number and approval.
 */

// The study description at the top of the form.
const STUDY_DESCRIPTION = `
  <h3>What the study is about</h3>
  <p>This science-fair study tests whether comparing a person's results with their own earlier
  results notices changes in thinking speed and attention better than comparing them with other people.</p>

  <h3>What you will do</h3>
  <ul>
    <li>8 sessions on an iPad at home, at least 24 hours apart, ideally at about the same time of day.
      Each takes about 20 to 40 minutes. The first session includes practice of every task.</li>
    <li>Each session: a few questions (for example how many hours you slept, and whether you had caffeine),
      short ratings of how you feel, and five short tap-the-screen tasks.</li>
    <li>In one of the last two sessions you watch a calm 16-minute nature video. In the other you do a
      16-minute task with letters and numbers that is designed to be mentally tiring.</li>
  </ul>

  <h3>Risks</h3>
  <p>You may feel tired, bored or frustrated, especially after the 16-minute letters-and-numbers task.
  There are no physical risks. You can take a break between sessions and stop at any time.</p>

  <h3>Benefits</h3>
  <p>There is no direct benefit to you. The results may help researchers notice real changes in
  thinking more reliably.</p>

  <h3>No diagnosis or scores</h3>
  <p>The tasks are not a medical or psychological test. You will not get a diagnosis or your scores.</p>

  <h3>Your information</h3>
  <ul>
    <li>Your name and email are used only for your login and are kept separately from your answers.</li>
    <li>Your answers are saved under a code (like P017), never your name.</li>
    <li>The data is stored by Google Firebase in the United States. Only the student researcher and
      their adult sponsor can see it.</li>
    <li>The app also records the time of each session and what kind of device you use (not your location).</li>
    <li>Names and email addresses are deleted within one year after the study ends. Your coded answers
      (with no name) may be kept and used in the science-fair project, where no one can tell they are yours.</li>
  </ul>

  <h3>Taking part is your choice</h3>
  <p>You can stop at any time, without any penalty: just stop doing sessions. If you stop, you can ask
  the researcher to delete your data.</p>

  <h3>Questions</h3>
  <p>Ask the student researcher who invited you, or their adult sponsor. For questions about your
  rights as a participant, contact the school's Institutional Review Board (IRB) through the adult sponsor.</p>

  <p>You can print or save a copy of this form with the link below it.</p>`;

// ONE form for everyone (Abhi, 2026-11-24: no age question, nobody excluded).
// The participant signs (required: this is the consent). Below it, a
// parent/guardian section for participants under 18 (optional in the app, so
// nobody is stopped; the research plan requires it for minors, so check it
// against the intake age in the analysis).
const CONSENT_FORM = {
  title: "Consent to take part",
  body: STUDY_DESCRIPTION,
  participant: {
    agree: "I have read this form, my questions have been answered, and I agree to take part.",
    nameLabel: "Your full name (as your signature)"
  },
  guardian: {
    heading: "If you are under 18: a parent or guardian",
    intro: "Please read this form together with your parent or guardian, and ask them to fill in this part.",
    agree: "I am the parent or legal guardian of the participant, I have read this form, and I give permission for them to take part.",
    nameLabel: "Parent or guardian's full name (as their signature)"
  }
};
