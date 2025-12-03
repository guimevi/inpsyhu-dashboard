import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp
} from 'firebase/firestore';
import { 
  Activity, 
  Users, 
  Plus, 
  Search, 
  ClipboardList, 
  LogOut, 
  User as UserIcon,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Building2,
  Calendar,
  Save,
  XCircle,
  ArrowRightCircle,
  Trash2,
  Stethoscope,
  GraduationCap,
  Mail,
  AlertOctagon,
  Lock,
  LogIn
} from 'lucide-react';

// ============================================================================
// --- 1. CONFIGURACIÓN DE FIREBASE ---
// ============================================================================
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
  apiKey: "AIzaSyBZMohe0LZ7Q27k_GvIbFgXVNbpbExsDYM",
  authDomain: "sistemaclinico-3c268.firebaseapp.com",
  projectId: "sistemaclinico-3c268",
  storageBucket: "sistemaclinico-3c268.firebasestorage.app",
  messagingSenderId: "348864687562",
  appId: "1:348864687562:web:f6b5217d1fccffaee87333",
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'hospital-main';

// ============================================================================

// --- Componente Principal ---
export default function PsychDashboard() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- Estados del Dashboard ---
  const [patients, setPatients] = useState([]);
  const [activeTab, setActiveTab] = useState('agudos');
  const [loadingData, setLoadingData] = useState(false);
  
  // --- Estados de Login ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // --- Modales y UI ---
  const [notification, setNotification] = useState({ message: '', visible: false });
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [actionModal, setActionModal] = useState({
    isOpen: false,
    type: null,
    patientId: null,
    currentPatientName: ''
  });

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    patientId: null,
    patientName: null
  });

  // Capacidades
  const CAPACITIES = {
    agudos: 11,
    comunidad: 12,
    espera: 999
  };

  // --- Formularios ---
  const initialAddFormState = {
    fullName: '', age: '', sex: 'M', ward: 'agudos', 
    diagnosis: '', admissionReason: '', resident: '', 
    supervisingProfessor: '', internmentType: 'general', 
    privatePsychiatrist: '', status: 'espera'
  };
  
  const [addFormData, setAddFormData] = useState(initialAddFormState);

  const initialActionFormState = {
    probableDischargeDate: '', dischargePsychiatrist: '',
    familyTherapist: '', voluntaryDischargeReason: '',
    transferArea: '', transferReason: ''
  };
  const [actionFormData, setActionFormData] = useState(initialActionFormState);

  // 1. Efecto de Autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Efecto de Datos
  useEffect(() => {
    if (!user) {
      setPatients([]);
      return;
    }

    setLoadingData(true);
    const patientsRef = collection(db, 'artifacts', appId, 'public', 'data', 'psych_patients_v8'); 
    
    const unsubscribe = onSnapshot(patientsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
         const priority = { alta_voluntaria: 3, prealta: 2, ingreso: 1, traslado: 1, alta: 0, espera: 0 };
         const diff = (priority[b.status] || 0) - (priority[a.status] || 0);
         if (diff !== 0) return diff;
         return (b.admissionDate?.seconds || 0) - (a.admissionDate?.seconds || 0);
      });
      setPatients(data);
      setLoadingData(false);
    });
    return () => unsubscribe();
  }, [user]);

  // --- Funciones de Autenticación ---

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      console.error(error);
      let msg = "Error de autenticación.";
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') msg = "Credenciales incorrectas.";
      if (error.code === 'auth/user-not-found') msg = "Usuario no encontrado.";
      if (error.code === 'auth/email-already-in-use') msg = "Correo ya registrado.";
      if (error.code === 'auth/weak-password') msg = "Contraseña muy débil.";
      setAuthError(msg);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al salir", error);
    }
  };

  // --- Notificaciones ---
  const showNotification = (msg) => {
    setNotification({ message: msg, visible: true });
    setTimeout(() => setNotification({ message: '', visible: false }), 4000);
  };

  const sendEmailNotification = (patientId, status) => {
    const patient = patients.find(p => p.id === patientId);
    const patientName = patient ? patient.fullName : 'Paciente';
    console.log(`[SMTP] Enviando a admin: ${patientName} -> ${status}`);
    showNotification(`Notificación enviada al administrador: Cambio a ${status.toUpperCase()}`);
  };

  // --- Lógica del Dashboard ---

  const getWardPatients = (ward) => patients.filter(p => p.ward === ward);

  const waitingList = useMemo(() => {
    return patients
      .filter(p => p.ward === 'espera')
      .filter(p => p.fullName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [patients, searchTerm]);

  const handleAddPatient = async (e) => {
    e.preventDefault();
    if (!user) return;

    try {
      let finalStatus = addFormData.status;
      if (addFormData.ward !== 'espera' && addFormData.status === 'espera') {
        finalStatus = 'ingreso';
      }
      
      if (addFormData.ward !== 'espera') {
         const currentCount = patients.filter(p => p.ward === addFormData.ward).length;
         if (currentCount >= CAPACITIES[addFormData.ward]) {
            alert(`La sala de ${addFormData.ward} está llena.`);
            return;
         }
      }

      const finalData = { ...addFormData };
      if (finalData.internmentType === 'general') delete finalData.privatePsychiatrist;

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'psych_patients_v8'), {
        ...finalData,
        age: Number(addFormData.age),
        status: finalStatus,
        admissionDate: serverTimestamp()
      });
      
      showNotification("Nuevo paciente registrado exitosamente");
      setShowAddModal(false);
      setAddFormData(initialAddFormState); 
    } catch (error) {
      console.error("Error saving:", error);
    }
  };

  const handleStatusChangeRequest = (patient, newStatus) => {
    if (newStatus === 'ingreso') {
        submitStatusUpdate(patient.id, newStatus, {});
        return;
    }
    setActionFormData(initialActionFormState);
    setActionModal({ isOpen: true, type: newStatus, patientId: patient.id, currentPatientName: patient.fullName });
  };

  const handleSubmitAction = async (e) => {
    e.preventDefault();
    if (!user || !actionModal.patientId || !actionModal.type) return;

    const updateData = {};
    const f = actionFormData;

    if (actionModal.type === 'prealta') {
        updateData.probableDischargeDate = f.probableDischargeDate;
        updateData.dischargePsychiatrist = f.dischargePsychiatrist;
        updateData.familyTherapist = f.familyTherapist;
    } else if (actionModal.type === 'alta') {
        updateData.dischargePsychiatrist = f.dischargePsychiatrist;
        updateData.familyTherapist = f.familyTherapist;
    } else if (actionModal.type === 'alta_voluntaria') {
        updateData.voluntaryDischargeReason = f.voluntaryDischargeReason;
    } else if (actionModal.type === 'traslado') {
        updateData.transferArea = f.transferArea;
        updateData.transferReason = f.transferReason;
    }

    await submitStatusUpdate(actionModal.patientId, actionModal.type, updateData);
    setActionModal({ isOpen: false, type: null, patientId: null });
  };

  const submitStatusUpdate = async (id, newStatus, extraData) => {
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'psych_patients_v8', id);
    await updateDoc(ref, { status: newStatus, ...extraData });
    sendEmailNotification(id, newStatus);
  };

  const requestDelete = (patient) => {
    setDeleteModal({ isOpen: true, patientId: patient.id, patientName: patient.fullName });
  };

  const confirmDelete = async () => {
    if (!deleteModal.patientId) return;
    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'psych_patients_v8', deleteModal.patientId);
        await deleteDoc(ref);
        setDeleteModal({ isOpen: false, patientId: null, patientName: null });
        showNotification("Registro eliminado correctamente");
    } catch (error) {
        console.error("Error al eliminar:", error);
    }
  };

  const moveToWard = async (patient, targetWard) => {
    if (!user) return;
    const currentOccupancy = patients.filter(p => p.ward === targetWard).length;
    if (currentOccupancy >= CAPACITIES[targetWard]) {
       alert(`No hay espacio en ${targetWard.toUpperCase()}.`);
       return;
    }
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'psych_patients_v8', patient.id);
    await updateDoc(ref, { ward: targetWard, status: 'ingreso', admissionDate: serverTimestamp() });
    sendEmailNotification(patient.id, `Asignado a ${targetWard}`);
  };

  const getCardStyle = (status) => {
    switch (status) {
      case 'prealta': return 'bg-yellow-50 border-l-8 border-l-yellow-400 border-y border-r border-slate-200 shadow-md';
      case 'alta_voluntaria': return 'bg-red-50 border-l-8 border-l-red-500 border-y border-r border-red-200 shadow-md';
      case 'traslado': return 'bg-purple-50 border-l-8 border-l-purple-500 border-y border-r border-slate-200 shadow-md';
      case 'alta': return 'bg-green-50 border-l-8 border-l-green-500 border-y border-r border-slate-200 shadow-md opacity-75';
      default: return 'bg-white border border-slate-200 shadow-sm';
    }
  };

  // --- RENDERIZADO ---

  if (isAuthLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Activity className="h-10 w-10 text-emerald-600 animate-spin" />
      </div>
    );
  }

  // >>> PANTALLA DE LOGIN <<<
  if (!user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="bg-emerald-600 px-8 py-10 text-center">
            <div className="bg-white/20 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <Activity className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">InPsyHU</h1>
          </div>
          
          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">
              {isRegistering ? 'Crear Cuenta' : 'Acceso Autorizado'}
            </h2>
            
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correo Electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="email" 
                    required
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="usuario@hospital.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    required
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {authError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <AlertOctagon size={16} />
                  {authError}
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
              >
                {isRegistering ? 'Registrarse' : 'Entrar'}
                {!isRegistering && <LogIn size={18} />}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button 
                onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
                className="text-sm text-emerald-600 hover:text-emerald-800 font-medium hover:underline"
              >
                {isRegistering ? 'Volver a inicio de sesión' : 'Registrar nuevo usuario'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // >>> DASHBOARD <<<
  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 pb-12 relative">
      
      {notification.visible && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom duration-300">
           <Mail className="text-emerald-400" size={20} />
           <div>
              <p className="text-sm font-semibold">Correo Generado</p>
              <p className="text-xs text-slate-300">{notification.message}</p>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 px-6 py-4 sticky top-0 z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white shadow-emerald-200 shadow-lg">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">InPsyHU</h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide">PANEL SEGURO • {user.email}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setAddFormData(initialAddFormState);
                setShowAddModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm text-sm font-medium transition-colors"
            >
              <Plus size={18} />
              Nuevo Paciente
            </button>
            
            <button 
              onClick={handleLogout}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 shadow-sm text-sm font-medium transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut size={18} />
              Salir
            </button>
          </div>
        </div>

        {/* Tabs - Orden Estricto: Agudos -> Comunidad -> Espera */}
        <div className="flex gap-2 mt-6 overflow-x-auto pb-2 md:pb-0">
          {[
            { id: 'agudos', label: 'Sala de Agudos', limit: 11, icon: AlertTriangle },
            { id: 'comunidad', label: 'Sala Comunidad', limit: 12, icon: Users },
            { id: 'espera', label: 'Lista de Espera', limit: null, icon: ClipboardList },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-lg border-b-2 transition-all ${
                activeTab === tab.id 
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.limit && (
                 <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    patients.filter(p=>p.ward===tab.id).length >= tab.limit ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
                 }`}>
                    {patients.filter(p=>p.ward===tab.id).length}/{tab.limit}
                 </span>
              )}
              {!tab.limit && waitingList.length > 0 && (
                 <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">
                    {waitingList.length}
                 </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {loadingData ? (
           <div className="text-center py-20 text-slate-400">Cargando datos del servidor...</div>
        ) : (
          <>
          {activeTab !== 'espera' && (
            <div>
              <div className="mb-6 flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                 <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="font-bold text-slate-800">Ocupación:</span>
                    <div className="w-32 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                       <div 
                          className={`h-full rounded-full transition-all duration-500 ${patients.length >= 23 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${(getWardPatients(activeTab).length / (activeTab === 'agudos' ? 11 : 12))*100}%` }}
                       />
                    </div>
                    <span>{getWardPatients(activeTab).length} de {activeTab === 'agudos' ? 11 : 12} espacios ocupados</span>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {getWardPatients(activeTab).map((patient) => (
                  <div key={patient.id} className={`relative rounded-xl p-4 flex flex-col justify-between transition-all group ${getCardStyle(patient.status)}`}>
                    
                    <button 
                       onClick={() => requestDelete(patient)}
                       className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors z-10"
                       title="Eliminar registro"
                    >
                       <Trash2 size={16} />
                    </button>

                    <div>
                      <div className="flex justify-between items-start mb-2 pr-8">
                         <span className={`px-2 py-1 rounded text-[10px] tracking-wider uppercase font-bold 
                            ${patient.status === 'ingreso' ? 'bg-blue-100 text-blue-800' : 
                              patient.status === 'prealta' ? 'bg-yellow-200 text-yellow-900 animate-pulse' :
                              patient.status === 'alta_voluntaria' ? 'bg-red-600 text-white' :
                              patient.status === 'traslado' ? 'bg-purple-200 text-purple-900' :
                              'bg-green-200 text-green-900'
                            }`}>
                            {patient.status.replace('_', ' ')}
                         </span>
                      </div>
                      {patient.status === 'prealta' && <div className="text-xs text-yellow-600 font-bold mb-1 flex items-center gap-1"><AlertTriangle size={12}/> Pre-Alta Activa</div>}

                      <h3 className="text-lg font-bold text-slate-800 leading-tight mb-1">{patient.fullName}</h3>
                      <div className="flex flex-col gap-1 mb-3">
                         <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                            <span>{patient.age} años</span>
                            <span>•</span>
                            <span className={`flex items-center gap-1 ${patient.internmentType === 'privado' ? 'text-purple-700 font-bold' : 'text-slate-500'}`}>
                               {patient.internmentType === 'privado' && <Building2 size={10} />}
                               {patient.internmentType === 'privado' ? 'PRIVADO' : 'SALA GENERAL'}
                            </span>
                         </div>
                         {patient.internmentType === 'privado' && patient.privatePsychiatrist && (
                            <div className="text-xs text-purple-800 font-semibold flex items-center gap-1">
                               <Stethoscope size={10}/> Psiq: {patient.privatePsychiatrist}
                            </div>
                         )}
                      </div>

                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="bg-slate-50/80 p-2 rounded border border-slate-100">
                          <p className="text-xs text-slate-400 font-semibold mb-0.5">Diagnóstico</p>
                          <p className="font-medium leading-snug">{patient.diagnosis}</p>
                        </div>
                        
                        <div className="pt-1 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                             <UserIcon size={12} className="text-slate-400"/>
                             <span className="truncate font-semibold text-slate-600">Res: {patient.resident}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                             <GraduationCap size={12} className="text-slate-400"/>
                             <span className="truncate text-slate-500">Sup: {patient.supervisingProfessor}</span>
                          </div>
                        </div>

                        {patient.status === 'prealta' && patient.probableDischargeDate && (
                           <div className="text-xs text-yellow-800 bg-yellow-100/50 p-2 rounded space-y-1">
                              <div className="flex items-center gap-1"><Calendar size={10}/> Alta Probable: {patient.probableDischargeDate}</div>
                              {patient.dischargePsychiatrist && <div>Manejo Amb: {patient.dischargePsychiatrist}</div>}
                           </div>
                        )}
                        {patient.status === 'traslado' && patient.transferArea && (
                           <div className="text-xs text-purple-800 bg-purple-100/50 p-1 rounded">
                              Destino: {patient.transferArea}
                           </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100/50">
                      <select 
                        className="w-full text-xs font-medium bg-white border border-slate-300 rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none mb-2 cursor-pointer"
                        value={patient.status}
                        onChange={(e) => handleStatusChangeRequest(patient, e.target.value)}
                      >
                        <option value="ingreso">INGRESO (Normal)</option>
                        <option value="prealta">PRE-ALTA</option>
                        <option value="traslado">TRASLADO</option>
                        <option value="alta">ALTA MÉDICA</option>
                        <option value="alta_voluntaria">ALTA VOLUNTARIA</option>
                      </select>
                      
                      {(['alta', 'alta_voluntaria', 'traslado'].includes(patient.status)) && (
                        <button 
                          onClick={() => requestDelete(patient)}
                          className="w-full text-center text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 py-1.5 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <LogOut size={12} /> Archivar Salida
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {Array.from({ length: Math.max(0, (activeTab === 'agudos' ? 11 : 12) - getWardPatients(activeTab).length) }).map((_, i) => (
                   <div key={`empty-${i}`} className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center min-h-[250px] bg-slate-50/50">
                      <span className="text-slate-300 text-sm font-medium">Espacio Disponible</span>
                   </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'espera' && (
             <div className="space-y-4">
             <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-3">
                <Search className="text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar paciente en espera..." 
                  className="flex-1 outline-none text-slate-700"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>

             <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
               <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                   <tr>
                     <th className="px-6 py-4 font-semibold">Paciente</th>
                     <th className="px-6 py-4 font-semibold">Diagnóstico / Motivo</th>
                     <th className="px-6 py-4 font-semibold">Staff Médico</th>
                     <th className="px-6 py-4 font-semibold">Internamiento</th>
                     <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {waitingList.map(p => (
                     <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                       <td className="px-6 py-4">
                         <div className="font-bold text-slate-900">{p.fullName}</div>
                         <div className="text-slate-500 text-xs mt-0.5">{p.age} años • {p.sex}</div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="font-medium text-slate-700">{p.diagnosis}</div>
                         <div className="text-slate-500 text-xs mt-0.5 italic text-wrap max-w-xs">{p.admissionReason}</div>
                       </td>
                       <td className="px-6 py-4 text-slate-600">
                          <div className="text-xs font-semibold">Res: {p.resident}</div>
                          <div className="text-[10px] text-slate-400">Sup: {p.supervisingProfessor}</div>
                       </td>
                       <td className="px-6 py-4">
                         <span className={`px-2 py-1 rounded text-xs font-bold border flex w-fit items-center gap-1 ${p.internmentType === 'privado' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                           {p.internmentType === 'privado' && <Building2 size={10} />}
                           {p.internmentType === 'privado' ? 'PRIVADO' : 'SALA GENERAL'}
                         </span>
                         {p.internmentType === 'privado' && p.privatePsychiatrist && (
                            <div className="text-[10px] text-purple-600 mt-1 font-medium">
                               Dr. {p.privatePsychiatrist}
                            </div>
                         )}
                       </td>
                       <td className="px-6 py-4 text-right">
                         <div className="flex items-center justify-end gap-2">
                            <button 
                               // @ts-ignore
                               disabled={patients.filter(x=>x.ward==='agudos').length >= CAPACITIES.agudos}
                               onClick={() => moveToWard(p, 'agudos')}
                               className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                               Agudos <ArrowRight size={12}/>
                            </button>
                            <button 
                               // @ts-ignore
                               disabled={patients.filter(x=>x.ward==='comunidad').length >= CAPACITIES.comunidad}
                               onClick={() => moveToWard(p, 'comunidad')}
                               className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                               Comunidad <ArrowRight size={12}/>
                            </button>
                            
                            <button 
                                onClick={() => requestDelete(p)} 
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded ml-2"
                                title="Eliminar Registro"
                            >
                               <Trash2 size={16} />
                            </button>
                         </div>
                       </td>
                     </tr>
                   ))}
                   {waitingList.length === 0 && (
                      <tr>
                         <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                            No hay pacientes pendientes de ingreso.
                         </td>
                      </tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>
          )}
          </>
        )}
      </main>

      {/* --- MODAL AGREGAR PACIENTE --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">Nuevo Ingreso / Lista de Espera</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
            </div>
            
            <form onSubmit={handleAddPatient} className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                 <div className="col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Identificación</div>
                 
                 <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                    <input required type="text" className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={addFormData.fullName} onChange={e => setAddFormData({...addFormData, fullName: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Edad</label>
                        <input required type="number" className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={addFormData.age} onChange={e => setAddFormData({...addFormData, age: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Sexo</label>
                        <select className="w-full border rounded p-2 bg-white" value={addFormData.sex} onChange={e => setAddFormData({...addFormData, sex: e.target.value})}>
                           <option value="M">Masculino</option>
                           <option value="F">Femenino</option>
                           <option value="X">Otro</option>
                        </select>
                    </div>
                 </div>

                 <div className="col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider mt-4 mb-1">Destino Inicial</div>
                 
                 <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sala de Asignación</label>
                    <select className="w-full border rounded p-2 bg-white font-medium" value={addFormData.ward} onChange={e => setAddFormData({...addFormData, ward: e.target.value})}>
                       <option value="agudos">Sala de Agudos (Ingreso Directo)</option>
                       <option value="comunidad">Sala Comunidad (Ingreso Directo)</option>
                       <option value="espera">Lista de Espera (Urgencias)</option>
                    </select>
                 </div>
                 
                 <div className="col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider mt-4 mb-1">Información Clínica</div>
                 
                 <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Diagnóstico (DSM-5/CIE-10)</label>
                    <input required type="text" className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={addFormData.diagnosis} onChange={e => setAddFormData({...addFormData, diagnosis: e.target.value})} />
                 </div>
                 <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de Ingreso / Observaciones</label>
                    <textarea required rows={2} className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={addFormData.admissionReason} onChange={e => setAddFormData({...addFormData, admissionReason: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Residente a cargo</label>
                    <input required type="text" className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={addFormData.resident} onChange={e => setAddFormData({...addFormData, resident: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Profesor Supervisor</label>
                    <input required type="text" className="w-full border rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" value={addFormData.supervisingProfessor} onChange={e => setAddFormData({...addFormData, supervisingProfessor: e.target.value})} />
                 </div>
                 
                 <div className="col-span-2 grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Internamiento</label>
                        <select className="w-full border rounded p-2 bg-white" value={addFormData.internmentType} onChange={e => setAddFormData({...addFormData, internmentType: e.target.value})}>
                           <option value="general">Sala General</option>
                           <option value="privado">Privado</option>
                        </select>
                     </div>
                     
                     {addFormData.internmentType === 'privado' && (
                        <div className="animate-in fade-in zoom-in duration-200">
                           <label className="block text-sm font-bold text-purple-700 mb-1">Nombre Psiquiatra Privado</label>
                           <input 
                              required 
                              type="text" 
                              className="w-full border border-purple-300 rounded p-2 focus:ring-2 focus:ring-purple-500 outline-none bg-purple-50" 
                              placeholder="Dr. Nombre Apellido"
                              value={addFormData.privatePsychiatrist} 
                              onChange={e => setAddFormData({...addFormData, privatePsychiatrist: e.target.value})} 
                           />
                        </div>
                     )}
                 </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                 <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Cancelar</button>
                 <button type="submit" className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-md font-medium">Guardar Expediente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL ELIMINAR --- */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <AlertOctagon size={32} className="text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">¿Eliminar Registro?</h3>
              <p className="text-slate-500 mb-6">
                 Estás a punto de borrar permanentemente el expediente de <br/>
                 <span className="font-bold text-slate-800">{deleteModal.patientName}</span>.
              </p>
              <div className="flex gap-3">
                 <button 
                    onClick={() => setDeleteModal({ isOpen: false, patientId: null, patientName: null })}
                    className="flex-1 py-2.5 border border-slate-300 rounded-lg font-medium text-slate-600 hover:bg-slate-50"
                 >
                    Cancelar
                 </button>
                 <button 
                    onClick={confirmDelete}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 shadow-md"
                 >
                    Sí, Eliminar
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* --- MODAL ACCIONES --- */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
             <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   {actionModal.type === 'prealta' && <><AlertTriangle className="text-yellow-500"/> Confirmar Pre-Alta</>}
                   {actionModal.type === 'alta' && <><ClipboardList className="text-green-600"/> Confirmar Alta Médica</>}
                   {actionModal.type === 'alta_voluntaria' && <><ShieldAlert className="text-red-600"/> Alta Voluntaria</>}
                   {actionModal.type === 'traslado' && <><ArrowRightCircle className="text-purple-600"/> Registrar Traslado</>}
                </h3>
                <button onClick={() => setActionModal({isOpen: false, type: null, patientId: null})} className="text-slate-400 hover:text-slate-600">
                   <XCircle size={24}/>
                </button>
             </div>
             
             <form onSubmit={handleSubmitAction} className="p-6 space-y-4">
                <p className="text-sm text-slate-500 mb-4">
                   Por favor complete los datos necesarios para registrar el cambio de estado de <span className="font-bold text-slate-800">{actionModal.currentPatientName}</span>.
                </p>

                {actionModal.type === 'prealta' && (
                   <>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Probable de Alta</label>
                         <input required type="date" className="w-full border rounded p-2" 
                           value={actionFormData.probableDischargeDate} 
                           onChange={e => setActionFormData({...actionFormData, probableDischargeDate: e.target.value})}
                         />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Psiquiatra a cargo (Manejo Ambulatorio)</label>
                         <input required type="text" className="w-full border rounded p-2" 
                           value={actionFormData.dischargePsychiatrist} 
                           onChange={e => setActionFormData({...actionFormData, dischargePsychiatrist: e.target.value})}
                         />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Terapeuta de familia ambulatorio</label>
                         <input required type="text" className="w-full border rounded p-2" 
                           value={actionFormData.familyTherapist} 
                           onChange={e => setActionFormData({...actionFormData, familyTherapist: e.target.value})}
                         />
                      </div>
                   </>
                )}

                {actionModal.type === 'alta' && (
                   <>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Psiquiatra a cargo en manejo ambulatorio</label>
                         <input required type="text" className="w-full border rounded p-2" 
                           value={actionFormData.dischargePsychiatrist} 
                           onChange={e => setActionFormData({...actionFormData, dischargePsychiatrist: e.target.value})}
                         />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Terapeuta de familia ambulatorio</label>
                         <input required type="text" className="w-full border rounded p-2" 
                           value={actionFormData.familyTherapist} 
                           onChange={e => setActionFormData({...actionFormData, familyTherapist: e.target.value})}
                         />
                      </div>
                   </>
                )}

                {actionModal.type === 'alta_voluntaria' && (
                   <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo del Alta Voluntaria</label>
                      <textarea required rows={4} className="w-full border rounded p-2 focus:ring-2 focus:ring-red-500 outline-none" 
                        placeholder="Describa las razones expresadas por el paciente o familiar..."
                        value={actionFormData.voluntaryDischargeReason} 
                        onChange={e => setActionFormData({...actionFormData, voluntaryDischargeReason: e.target.value})}
                      />
                   </div>
                )}

                {actionModal.type === 'traslado' && (
                   <>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Área de Traslado</label>
                         <input required type="text" placeholder="Ej. Medicina Interna, UCI..." className="w-full border rounded p-2" 
                           value={actionFormData.transferArea} 
                           onChange={e => setActionFormData({...actionFormData, transferArea: e.target.value})}
                         />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo del Traslado</label>
                         <textarea required rows={3} className="w-full border rounded p-2" 
                           value={actionFormData.transferReason} 
                           onChange={e => setActionFormData({...actionFormData, transferReason: e.target.value})}
                         />
                      </div>
                   </>
                )}

                <div className="flex gap-3 pt-4">
                   <button type="button" onClick={() => setActionModal({isOpen: false, type: null, patientId: null})} className="flex-1 py-2 border border-slate-300 rounded hover:bg-slate-50 text-sm">Cancelar</button>
                   <button type="submit" className="flex-1 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 text-sm font-medium flex items-center justify-center gap-2">
                      <Save size={16}/> Guardar y Cambiar
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}

    </div>
  );
}