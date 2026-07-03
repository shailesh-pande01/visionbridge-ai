import React, { useState } from 'react';
import './Contact.css';

const INITIAL = { name: '', email: '', message: '' };

function Contact() {
  const [form, setForm] = useState(INITIAL);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: POST to /api/contact
    setSubmitted(true);
    setForm(INITIAL);
  };

  return (
    <div className="contact-page">

      {/* Page Header */}
      <section className="section contact-header">
        <div className="container">
          <p className="hero__eyebrow">Get In Touch</p>
          <h1 className="section-title">Contact VisionBridge</h1>
          <p className="section-sub">Questions, feedback, or want to volunteer? We'd love to hear from you.</p>
        </div>
      </section>

      <div className="divider" />

      {/* Form + Info */}
      <section className="section contact-body">
        <div className="container contact-layout">

          {/* Form */}
          {submitted ? (
            <div className="card success-msg" role="alert" aria-live="polite">
              <span aria-hidden="true">✅</span>
              <h2>Message Sent!</h2>
              <p>We'll get back to you soon. Thank you for reaching out.</p>
              <button className="btn-outline" onClick={() => setSubmitted(false)}>
                Send Another
              </button>
            </div>
          ) : (
            <form
              className="card contact-form"
              onSubmit={handleSubmit}
              aria-label="Contact form"
              noValidate
            >
              <div className="form-field">
                <label htmlFor="name" className="form-label">Full Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  className="form-input"
                  placeholder="Your name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  aria-required="true"
                  autoComplete="name"
                />
              </div>

              <div className="form-field">
                <label htmlFor="email" className="form-label">Email Address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                  aria-required="true"
                  autoComplete="email"
                />
              </div>

              <div className="form-field">
                <label htmlFor="message" className="form-label">Message</label>
                <textarea
                  id="message"
                  name="message"
                  className="form-input form-textarea"
                  placeholder="How can we help you?"
                  value={form.message}
                  onChange={handleChange}
                  required
                  aria-required="true"
                  rows={6}
                />
              </div>

              <button type="submit" className="btn-primary">
                Send Message
              </button>
            </form>
          )}

          {/* Quick info sidebar */}
          <aside className="card contact-info" aria-label="Contact information">
            <h2 className="contact-info__title">Quick Info</h2>
            <ul className="contact-info__list" role="list">
              <li>
                <span aria-hidden="true">📧</span>
                <span>support@visionbridge.app</span>
              </li>
              <li>
                <span aria-hidden="true">🌐</span>
                <span>visionbridge.app</span>
              </li>
              <li>
                <span aria-hidden="true">♿</span>
                <span>Accessibility feedback always welcome</span>
              </li>
            </ul>
          </aside>

        </div>
      </section>

    </div>
  );
}

export default Contact;
