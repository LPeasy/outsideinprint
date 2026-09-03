(function () {
  "use strict";

  var form = document.querySelector("[data-studio-email-form]");
  var submitButton;
  var status;
  var emailPattern = /^[A-Za-z0-9_%+-]+(\.[A-Za-z0-9_%+-]+)*@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
  var requiredFields = [
    "name",
    "email",
    "website",
    "role",
    "source_material",
    "source_size",
    "intended_reader",
    "project_subject",
    "desired_outcome",
    "timeline",
    "source_safety_acknowledgement",
    "commercial_acknowledgement"
  ];

  function clean(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "")
      .trim();
  }

  function hasRequiredDom() {
    return requiredFields.every(function (name) {
      return !!form.elements.namedItem(name);
    });
  }

  function configured() {
    var recipient = clean(form.dataset.inquiryEmail);
    var subjectPrefix = clean(form.dataset.inquirySubjectPrefix);

    return emailPattern.test(recipient) &&
      recipient.length <= 254 &&
      subjectPrefix.length > 0 &&
      subjectPrefix.length <= 100 &&
      clean(form.dataset.currentRate).length > 0 &&
      clean(form.dataset.depositPercent).length > 0 &&
      clean(form.dataset.offerCode).length > 0 &&
      clean(form.dataset.sourcePage).length > 0;
  }

  function value(data, name) {
    return clean(data.get(name));
  }

  function prepareInquiry(event) {
    var data;
    var recipient;
    var subjectPrefix;
    var subject;
    var body;
    var mailtoUri;

    event.preventDefault();

    data = new FormData(form);
    recipient = clean(form.dataset.inquiryEmail);
    subjectPrefix = clean(form.dataset.inquirySubjectPrefix);
    subject = subjectPrefix + " — " + value(data, "project_subject");
    body = [
      subjectPrefix,
      "",
      "Name: " + value(data, "name"),
      "Best reply email: " + value(data, "email"),
      "Website or profile: " + (value(data, "website") || "Not provided"),
      "Role: " + value(data, "role"),
      "Source material: " + value(data, "source_material"),
      "Source size: " + value(data, "source_size"),
      "Intended reader: " + value(data, "intended_reader"),
      "Proposed essay: " + value(data, "project_subject"),
      "Desired outcome: " + value(data, "desired_outcome"),
      "Preferred start: " + value(data, "timeline"),
      "Price acknowledgment: I understand that the current rate is " + clean(form.dataset.currentRate) + ". A " + clean(form.dataset.depositPercent) + "% deposit is required to book the project.",
      "",
      "Safety acknowledgment: I have not attached or pasted confidential, classified, privileged, export-controlled, or restricted source material. I will wait for Outside In Print to ask for source files and tell me what it can accept and how to send it.",
      "This inquiry does not reserve a production slot or create a client relationship."
    ].join("\n").replace(/\n/g, "\r\n");

    status.textContent = "Your email app should open with a draft. Review it before you send it. Outside In Print will receive your inquiry only if you send the email and it reaches us.";
    mailtoUri = "mailto:" + recipient + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    window.location.href = mailtoUri;
  }

  if (!form) {
    return;
  }

  submitButton = form.querySelector('button[type="submit"]');
  status = form.querySelector("[data-studio-form-status]");

  if (!submitButton || !status || !hasRequiredDom() || !configured()) {
    return;
  }

  form.addEventListener("submit", prepareInquiry);
  submitButton.disabled = false;
}());
