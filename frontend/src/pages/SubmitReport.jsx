import { useContext, useState } from 'react';
import { Send } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';
import PageHeader from '../components/PageHeader';
import StatusBanner from '../components/StatusBanner';

const SPECIALTIES = ['Cardiologie', 'Médecine générale', 'Endocrinologie', 'Pneumologie', 'Neurologie', 'Rhumatologie', 'Autre'];
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (delegateName = '') => ({
  delegateName,
  doctorName: '',
  specialty: 'Cardiologie',
  visitDate: today(),
  medications: '',
  notes: '',
});

const SubmitReport = ({ isSidebarOpen, setIsSidebarOpen }) => {
  const { user } = useContext(AuthContext);
  const [formData, setFormData] = useState(() => emptyForm(user?.name || ''));
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.delegateName.trim() || !formData.doctorName.trim() || !formData.visitDate || !formData.medications.trim()) {
      setBanner({ tone: 'error', text: 'Renseignez le médecin, la date et au moins un médicament.' });
      return;
    }

    setSaving(true);
    setBanner(null);
    try {
      await apiClient.post('/reports', {
        ...formData,
        delegateName: formData.delegateName.trim(),
        doctorName: formData.doctorName.trim(),
        medications: formData.medications.trim(),
        notes: formData.notes.trim(),
      });
      setBanner({ tone: 'success', text: 'Le compte rendu a été enregistré.' });
      setFormData(emptyForm(user?.name || formData.delegateName));
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) return;
      const detail = error.response?.data?.detail;
      setBanner({
        tone: 'error',
        text: typeof detail === 'string' ? detail : 'Enregistrement impossible. Vérifiez que l’API est démarrée.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} title="Nouvelle visite" subtitle="Compte rendu transmis au tableau de bord" />
      <div className="page-content">
        <div className="page-inner">
          <StatusBanner tone={banner?.tone}>{banner?.text}</StatusBanner>
          <div className="split-layout">
            <form className="crm-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="delegateName">Délégué</label>
                <input id="delegateName" name="delegateName" value={formData.delegateName} readOnly />
              </div>
              <div className="form-group">
                <label htmlFor="doctorName">Médecin</label>
                <input id="doctorName" name="doctorName" value={formData.doctorName} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="specialty">Spécialité</label>
                <select id="specialty" name="specialty" value={formData.specialty} onChange={handleChange}>
                  {SPECIALTIES.map((specialty) => <option key={specialty}>{specialty}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="visitDate">Date de visite</label>
                <input id="visitDate" type="date" name="visitDate" value={formData.visitDate} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="medications">Médicaments discutés</label>
                <input id="medications" name="medications" value={formData.medications} onChange={handleChange} placeholder="Ex. Doliprane, Glucophage" required />
                <p className="field-hint">Séparez les produits par une virgule.</p>
              </div>
              <div className="form-group">
                <label htmlFor="notes">Notes</label>
                <textarea id="notes" name="notes" rows="4" value={formData.notes} onChange={handleChange} />
              </div>
              <button type="submit" className="primary-btn" disabled={saving}>
                <Send size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </form>

            <aside className="info-card">
              <h3>Avant d’enregistrer</h3>
              <ol>
                <li>Le nom du délégué reprend le compte connecté.</li>
                <li>Indiquez le médecin réellement visité.</li>
                <li>Listez chaque médicament discuté.</li>
                <li>Les notes restent visibles dans l’export.</li>
              </ol>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
};

export default SubmitReport;
