import { useCallback, useEffect, useState } from 'react';
import { Activity, FileText, Pill, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import apiClient from '../services/apiClient';
import PageHeader from '../components/PageHeader';
import StatusBanner from '../components/StatusBanner';

const COLORS = ['#0f766e', '#2563eb', '#d97706', '#e11d48', '#7c3aed'];

const tooltipStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
};

const Dashboard = ({ isSidebarOpen, setIsSidebarOpen }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/dashboard/stats');
      setStats(response.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) return;
      setStats(null);
      setError('Impossible de charger les indicateurs. Vérifiez que l’API est démarrée.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const medications = stats?.topMedications || [];
  const specialties = stats?.topSpecialties || [];
  const months = stats?.monthlyVisits || [];

  return (
    <>
      <PageHeader isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} title="Activité" subtitle="Visites, médecins et médicaments discutés" />
      <div className="page-content">
        {loading ? (
          <div className="loading-state">Chargement des indicateurs…</div>
        ) : (
          <div className="page-inner">
            <StatusBanner>{error}</StatusBanner>
            {error ? <button type="button" className="secondary-btn" onClick={fetchStats}>Réessayer</button> : null}

            {!error ? (
            <>
            <section className="kpi-grid">
              <article className="kpi-card">
                <div className="kpi-icon"><FileText size={18} /></div>
                <div>
                  <div className="kpi-label">Visites</div>
                  <div className="kpi-value">{stats?.totalVisits || 0}</div>
                </div>
              </article>
              <article className="kpi-card">
                <div className="kpi-icon"><Users size={18} /></div>
                <div>
                  <div className="kpi-label">Médecins</div>
                  <div className="kpi-value">{stats?.uniqueDoctors || 0}</div>
                </div>
              </article>
              <article className="kpi-card">
                <div className="kpi-icon"><Pill size={18} /></div>
                <div>
                  <div className="kpi-label">Mentions produits</div>
                  <div className="kpi-value">{stats?.medicationMentions || 0}</div>
                </div>
              </article>
            </section>

            <section className="chart-grid">
              <article className="panel">
                <h2 className="panel-title"><Pill size={16} /> Médicaments les plus cités</h2>
                {medications.length ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={medications} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} interval={0} />
                        <YAxis stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip cursor={{ fill: 'var(--bg-tertiary)' }} contentStyle={tooltipStyle} />
                        <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className="empty-state">Aucune visite enregistrée.</div>}
              </article>

              <article className="panel">
                <h2 className="panel-title"><Activity size={16} /> Spécialités</h2>
                {specialties.length ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={specialties} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                          {specialties.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className="empty-state">Pas encore de spécialités.</div>}
              </article>
            </section>

            <article className="panel">
              <h2 className="panel-title">Visites par mois</h2>
              {months.length ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="visits" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="empty-state">Les dates de visite apparaîtront ici.</div>}
            </article>
            </>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
};

export default Dashboard;
