import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import apiClient from '../services/apiClient';
import PageHeader from '../components/PageHeader';
import StatusBanner from '../components/StatusBanner';

const GenerateReport = ({ isSidebarOpen, setIsSidebarOpen }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const [banner, setBanner] = useState(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setBanner(null);
    try {
      const response = await apiClient.get('/reports/generate');
      const content = response.data?.markdown || '';
      setMarkdown(content);

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rapport_crm_${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const empty = content.startsWith('Aucun rapport');
      setBanner({
        tone: empty ? 'warning' : 'success',
        text: empty ? 'Aucun compte rendu à exporter pour le moment.' : 'Le rapport a été téléchargé.',
      });
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) return;
      setBanner({ tone: 'error', text: 'Génération impossible. Vérifiez que l’API est démarrée.' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <PageHeader isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} title="Export" subtitle="Synthèse Markdown des visites enregistrées" />
      <div className="page-content">
        <div className="page-inner">
          <StatusBanner tone={banner?.tone}>{banner?.text}</StatusBanner>
          <section className="split-layout">
            <article className="panel">
              <h2 className="panel-title">Contenu du fichier</h2>
              <ul className="info-card" style={{ listStyle: 'disc', background: 'transparent', border: 0, boxShadow: 'none', padding: '0 0 0 18px' }}>
                <li>Volume de visites et médecins uniques</li>
                <li>Spécialité la plus fréquente</li>
                <li>Cinq médicaments les plus discutés</li>
                <li>Détail de chaque compte rendu</li>
              </ul>
              <button type="button" className="primary-btn" style={{ marginTop: 20 }} onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
                {isGenerating ? 'Préparation…' : 'Télécharger le rapport'}
              </button>
            </article>
            <article className="info-card">
              <h3>Utilisation</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                Le fichier reprend les visites déjà enregistrées. Ajoutez un compte rendu si l’export est vide.
              </p>
            </article>
          </section>
          {markdown ? <pre className="report-preview">{markdown}</pre> : null}
        </div>
      </div>
    </>
  );
};

export default GenerateReport;
