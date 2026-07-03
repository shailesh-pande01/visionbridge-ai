import React, { useState, useEffect } from 'react';
import { getContacts, addContact, updateContact, deleteContact } from '../../services/sosService';

function EmergencyContactsView() {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const data = await getContacts();
      setContacts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !relationship.trim()) {
      setError('Please fill in all fields (Name, Phone, Relationship).');
      return;
    }

    setError(null);
    try {
      if (editingId) {
        await updateContact(editingId, name, phone, relationship);
        setEditingId(null);
      } else {
        await addContact(name, phone, relationship);
      }
      setName('');
      setPhone('');
      setRelationship('');
      fetchContacts();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance('Emergency contact saved successfully.'));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (contact) => {
    setEditingId(contact._id);
    setName(contact.name);
    setPhone(contact.phone);
    setRelationship(contact.relationship);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this emergency contact?')) return;
    try {
      await deleteContact(id);
      fetchContacts();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance('Emergency contact deleted.'));
      }
    } catch (err) {
      alert('Failed to delete contact: ' + err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setRelationship('');
  };

  return (
    <div className="sos-container" style={{ padding: 0 }}>
      {/* Contact Form */}
      <div className="sos-card">
        <h2 className="sos-card-title">👥 {editingId ? 'Edit Emergency Contact' : 'Add Trusted Contact'}</h2>

        {error && (
          <div style={{ padding: '1.25rem', background: '#271414', border: '3px solid #ef4444', borderRadius: '16px', marginBottom: '2rem', fontWeight: 800, color: '#fca5a5', fontSize: '1.25rem' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="sos-form-group">
            <label className="sos-label">👤 Contact Name</label>
            <input
              type="text"
              className="sos-input"
              placeholder="e.g. Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Contact Name"
            />
          </div>

          <div className="sos-form-group">
            <label className="sos-label">📞 Phone Number</label>
            <input
              type="tel"
              className="sos-input"
              placeholder="e.g. +1 555-0192"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="Phone Number"
            />
          </div>

          <div className="sos-form-group">
            <label className="sos-label">🤝 Relationship</label>
            <input
              type="text"
              className="sos-input"
              placeholder="e.g. Family, Friend, Doctor"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              aria-label="Relationship"
            />
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '2.5rem' }}>
            <button type="submit" className="sos-btn-block sos-btn-success" style={{ flex: 2 }}>
              ✓ {editingId ? 'Update Contact' : 'Save Contact'}
            </button>
            {editingId && (
              <button type="button" className="sos-btn-block sos-btn-cancel" style={{ flex: 1 }} onClick={handleCancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Contact List */}
      <div className="sos-card">
        <h2 className="sos-card-title">🛡️ Saved Emergency Contacts</h2>

        {loading ? (
          <p style={{ fontSize: '1.35rem', color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>Loading contacts...</p>
        ) : contacts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
            <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: '1rem' }}>📇</span>
            <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff' }}>No Contacts Saved Yet</h3>
            <p style={{ fontSize: '1.25rem', marginTop: '0.5rem' }}>Add trusted family members or friends above to notify them instantly during an emergency.</p>
          </div>
        ) : (
          <div className="sos-contact-list">
            {contacts.map((c) => (
              <div key={c._id} className="sos-contact-item">
                <div className="sos-contact-item__top">
                  <span className="sos-contact-item__name">{c.name}</span>
                  <span className="sos-contact-item__rel">{c.relationship}</span>
                </div>
                <div className="sos-contact-item__phone">
                  <span aria-hidden="true">📞</span> {c.phone}
                </div>
                <div className="sos-contact-item__actions">
                  <button type="button" onClick={() => handleEdit(c)}>✏️ Edit</button>
                  <button type="button" className="btn-del" onClick={() => handleDelete(c._id)}>🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmergencyContactsView;
