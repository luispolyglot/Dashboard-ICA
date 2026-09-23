import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  GraduationCapIcon,
  LanguagesIcon,
  LineChartIcon,
  ListChecksIcon,
  LogOutIcon,
  MoonIcon,
  PencilIcon,
  ShieldIcon,
  SunIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { PendingReviewDot } from "../components/PendingReviewDot";
import { ProfileFeatureCard } from "../components/ProfileFeatureCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/theme/ThemeContext";
import { useIcaTestsOverview } from "../hooks/useIcaTestsOverview";
import { fetchAdminRole } from "../services/adminAnalytics";
import {
  fetchCoachingAccess,
  fetchCoachingPendingReviewSummary,
  fetchMyCoachingDashboard,
} from "../services/coaching";
import { DASHBOARD_ROUTES } from "../routes/paths";
import {
  ICA_TEST_REQUIRED_WORDS,
} from "../services/icaTests";
import type { AppConfig, Lexicard } from "../types";

type ProfileViewProps = {
  config: AppConfig | null;
  cards: Lexicard[];
  onEditLanguages: () => void;
};

export function ProfileView({
  config,
  cards,
  onEditLanguages,
}: ProfileViewProps) {
  const navigate = useNavigate();
  const { user, signOut, changePassword, updateDisplayName } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmNextPassword, setConfirmNextPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [canSeeAdminAnalytics, setCanSeeAdminAnalytics] = useState(false);
  const [canManageWhitelist, setCanManageWhitelist] = useState(false);
  const [canManageCalendarIcademy, setCanManageCalendarIcademy] =
    useState(false);
  const [canSeeHistoricLeaderboard, setCanSeeHistoricLeaderboard] =
    useState(false);
  const [canSeeCoachingPersonalized, setCanSeeCoachingPersonalized] =
    useState(false);
  const [canManageCoaching, setCanManageCoaching] = useState(false);
  const [pendingCoachingSessions, setPendingCoachingSessions] = useState(0);
  const [pendingCoachingNotes, setPendingCoachingNotes] = useState(0);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const {
    hasCurrentMonthTest,
    canHighlightCurrentMonth,
    featureAvailable,
    wordPool,
  } = useIcaTestsOverview({
    targetLang: config?.targetLang,
    nativeLang: config?.nativeLang,
    cards,
  });

  const metadata = useMemo(
    () => user?.user_metadata ?? {},
    [user?.user_metadata],
  );
  const displayName =
    metadata.display_name || user?.email?.split("@")[0] || "Usuario";
  const cleanCurrentDisplayName = displayName.trim();
  const cleanNameDraft = nameDraft.trim();
  const isNameChanged = cleanNameDraft !== cleanCurrentDisplayName;
  const canSaveName = cleanNameDraft.length >= 3 && isNameChanged;

  useEffect(() => {
    if (!isEditingName) {
      setNameDraft(displayName);
    }
  }, [displayName, isEditingName]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const [role, coachingAccess, coachingMemberships, pendingSummary] =
        await Promise.all([
          fetchAdminRole(),
          fetchCoachingAccess().catch(() => null),
          fetchMyCoachingDashboard(config?.targetLang).catch(() => []),
          fetchCoachingPendingReviewSummary().catch(() => ({
            hasPendingReviews: false,
            pendingSessions: 0,
            pendingNotes: 0,
          })),
        ]);
      if (!isMounted) return;

      setCanSeeAdminAnalytics(role === "admin" || role === "super_admin");
      setCanManageWhitelist(role === "super_admin");
      setCanManageCalendarIcademy(role === "super_admin");
      setCanSeeHistoricLeaderboard(role === "super_admin");
      setCanSeeCoachingPersonalized(
        Array.isArray(coachingMemberships) && coachingMemberships.length > 0,
      );
      setCanManageCoaching(Boolean(coachingAccess?.isCoachingAdmin));
      setPendingCoachingSessions(pendingSummary.pendingSessions);
      setPendingCoachingNotes(pendingSummary.pendingNotes);
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [user?.id, config?.targetLang]);

  const handleLogout = async (): Promise<void> => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await signOut();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handlePasswordChange = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (nextPassword.length < 6) {
      setPasswordError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (nextPassword !== confirmNextPassword) {
      setPasswordError("Las nuevas contraseñas no coinciden.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmNextPassword("");
      setPasswordSuccess("Contraseña actualizada correctamente.");
      window.setTimeout(() => setIsPasswordModalOpen(false), 900);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la contraseña";
      setPasswordError(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleStartNameEdit = () => {
    setNameDraft(displayName);
    setNameError(null);
    setNameSuccess(null);
    setIsEditingName(true);
  };

  const handleCancelNameEdit = () => {
    if (isSavingName) return;
    setNameDraft(displayName);
    setNameError(null);
    setIsEditingName(false);
  };

  const handleSaveName = async (): Promise<void> => {
    const cleanName = nameDraft.trim();
    if (cleanName === cleanCurrentDisplayName) {
      setNameError(null);
      setIsEditingName(false);
      return;
    }

    if (cleanName.length < 3) {
      setNameError("El nombre debe tener al menos 3 caracteres.");
      return;
    }

    setNameError(null);
    setNameSuccess(null);
    setIsSavingName(true);
    try {
      await updateDisplayName(cleanName);
      setIsEditingName(false);
      setNameSuccess("Nombre actualizado correctamente.");
      window.setTimeout(() => setNameSuccess(null), 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo actualizar el nombre.";
      setNameError(message);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleNameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelNameEdit();
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-8 sm:px-6">
      <h2 className="mb-1 font-serif text-3xl font-bold">👤 Perfil</h2>
      <p className="text-sm text-muted-foreground">
        Gestiona tu cuenta, idioma y apariencia desde un solo lugar.
      </p>
      <p className="mb-6 text-xs text-muted-foreground/90">
        {user?.email || "No disponible"}
      </p>

      <div className="space-y-8 pb-2">
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Cuenta y preferencias</h3>
            <p className="text-sm text-muted-foreground">
              Datos personales, idioma, tema, seguridad y notificaciones.
            </p>
          </div>
          <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-4">
            <ProfileFeatureCard
              title="Nombre"
              icon={UserIcon}
              description={
                <div className="space-y-1 text-xs sm:text-sm">
                  <p className="font-medium">{displayName}</p>
                  {nameError && (
                    <p className="text-xs text-destructive">{nameError}</p>
                  )}
                  {nameSuccess && (
                    <p className="text-xs text-emerald-600">{nameSuccess}</p>
                  )}
                </div>
              }
              actions={
                isEditingName ? (
                  <form
                    className="flex w-full items-center gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSaveName();
                    }}
                  >
                    <Input
                      value={nameDraft}
                      onChange={(event) => {
                        setNameDraft(event.target.value);
                        setNameError(null);
                        setNameSuccess(null);
                      }}
                      onKeyDown={handleNameKeyDown}
                      minLength={3}
                      required
                      autoFocus
                      className="h-8"
                      aria-label="Editar nombre"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Guardar nombre"
                      disabled={isSavingName || !canSaveName}
                    >
                      <CheckIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Cancelar edición de nombre"
                      onClick={handleCancelNameEdit}
                      disabled={isSavingName}
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleStartNameEdit}
                  >
                    <PencilIcon className="h-4 w-4" />
                    Editar nombre
                  </Button>
                )
              }
              className="md:w-[15.5rem]"
            />

            <ProfileFeatureCard
              title="Idiomas"
              icon={LanguagesIcon}
              onMainAction={onEditLanguages}
              description={
                config
                  ? `${config.nativeLang} -> ${config.targetLang}`
                  : "No hay configuración de idiomas"
              }
            />

            <ProfileFeatureCard
              title={`Tema (${resolvedTheme === "dark" ? "Oscuro" : "Claro"})`}
              icon={resolvedTheme === "dark" ? MoonIcon : SunIcon}
              description="Elige el tema visual de la app."
              actions={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={theme === "light" ? "default" : "outline"}
                    onClick={() => setTheme("light")}
                  >
                    Claro
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={theme === "dark" ? "default" : "outline"}
                    onClick={() => setTheme("dark")}
                  >
                    Oscuro
                  </Button>
                </>
              }
            />

            <ProfileFeatureCard
              title="Notificaciones"
              icon={BellIcon}
              onMainAction={() => navigate(DASHBOARD_ROUTES.manageNotifications)}
              description="Configura recordatorios de rachas y hábitos por push."
            />

            <ProfileFeatureCard
              title="Cambiar contraseña"
              icon={ShieldIcon}
              onMainAction={() => {
                setPasswordError(null);
                setPasswordSuccess(null);
                setCurrentPassword("");
                setNextPassword("");
                setConfirmNextPassword("");
                setIsPasswordModalOpen(true);
              }}
              description="Actualiza tu contraseña con validación de seguridad."
            />

            <ProfileFeatureCard
              title={isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
              icon={LogOutIcon}
              onMainAction={() => void handleLogout()}
              description="Finaliza tu sesión actual en el dispositivo."
              className="border-destructive/45 text-destructive hover:border-destructive hover:bg-destructive/5 dark:text-rose-300"
            />
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Estudio y progreso</h3>
            <p className="text-sm text-muted-foreground">
              Herramientas de seguimiento, contenido y resultados mensuales.
            </p>
          </div>
          <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-4">
            <ProfileFeatureCard
              title="Trackers"
              icon={LineChartIcon}
              onMainAction={() => navigate(DASHBOARD_ROUTES.trackers)}
              description="Pronunciación, fluidez e improvisación mensual."
            />
            <ProfileFeatureCard
              title="Track Instagram"
              icon={CameraIcon}
              onMainAction={() => navigate(DASHBOARD_ROUTES.instagramTrackPosts)}
              description="Registro diario de publicaciones con edición limitada."
            />
            <ProfileFeatureCard
              title="Calendario"
              icon={CalendarDaysIcon}
              onMainAction={() => navigate(DASHBOARD_ROUTES.calendarIcademy)}
              description="Consulta horarios por idioma y sesiones activas."
            />
            <ProfileFeatureCard
              title="Estadísticas"
              icon={BarChart3Icon}
              onMainAction={() => navigate(DASHBOARD_ROUTES.myAnalytics)}
              description="Palabras, frases, notas maestras y flashcards."
            />
            <ProfileFeatureCard
              title="Tests ICA"
              icon={ClipboardCheckIcon}
              onMainAction={() => navigate(DASHBOARD_ROUTES.testsIca)}
              headerRight={
                canHighlightCurrentMonth && !hasCurrentMonthTest ? (
                  <div className="relative mt-0.5 size-3.5">
                    <div className="absolute top-0 size-3.5 rounded-full animate-pulse bg-amber-300 delay-300"></div>
                    <div className="absolute top-0 size-3.5 rounded-full animate-ping bg-primary"></div>
                  </div>
                ) : null
              }
              description={
                !featureAvailable
                  ? "Disponible desde mayo de 2026."
                  : hasCurrentMonthTest
                    ? "Ya completaste el test del mes actual."
                  : wordPool.eligible
                      ? "Tienes vocabulario suficiente para hacer el test del mes."
                      : `Necesitas ${ICA_TEST_REQUIRED_WORDS} palabras ICA. Tienes ${wordPool.availableWords}.`
              }
            />
          </div>
        </section>

        {(canSeeCoachingPersonalized || canManageCoaching) && (
          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Coaching</h3>
              <p className="text-sm text-muted-foreground">
                Accesos de clases personalizadas y gestión de seguimiento.
              </p>
            </div>
            <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-4">
              {canSeeCoachingPersonalized && (
                <ProfileFeatureCard
                  title="Coaching personalizado"
                  icon={GraduationCapIcon}
                  onMainAction={() => navigate(DASHBOARD_ROUTES.coachingPersonalized)}
                  tone="coaching"
                  description="Clases semanales, feedback y objetivos ICA."
                />
              )}

              {canManageCoaching && (
                <ProfileFeatureCard
                  title="Administrar coaching"
                  icon={UsersIcon}
                  onMainAction={() => navigate(DASHBOARD_ROUTES.manageCoaching)}
                  tone="coaching"
                  headerRight={
                    pendingCoachingSessions > 0 ? (
                      <PendingReviewDot
                        title={`Tienes ${pendingCoachingNotes} notas pendientes de revision en ${pendingCoachingSessions} sesiones.`}
                        useIconSpeaker
                      />
                    ) : null
                  }
                  description={
                    pendingCoachingSessions > 0
                      ? `Pendientes: ${pendingCoachingNotes} nota${pendingCoachingNotes === 1 ? "" : "s"} en ${pendingCoachingSessions} sesión${pendingCoachingSessions === 1 ? "" : "es"}.`
                      : "Gestiona usuarios, feedback y objetivos personalizados."
                  }
                />
              )}
            </div>
          </section>
        )}

        {(canSeeAdminAnalytics ||
          canManageWhitelist ||
          canManageCalendarIcademy ||
          canSeeHistoricLeaderboard) && (
          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Administración</h3>
              <p className="text-sm text-muted-foreground">
                Paneles para admins y super admins con acciones avanzadas.
              </p>
            </div>
            <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-4">
              {canSeeAdminAnalytics && (
                <ProfileFeatureCard
                  title="Analíticas admin"
                  icon={BarChart3Icon}
                  onMainAction={() => navigate(DASHBOARD_ROUTES.analytics)}
                  tone="admin"
                  description="Métricas globales de la plataforma."
                />
              )}

              {canManageWhitelist && (
                <>
                  <ProfileFeatureCard
                    title="Whitelist"
                    icon={ListChecksIcon}
                    onMainAction={() => navigate(DASHBOARD_ROUTES.manageWhitelist)}
                    tone="superAdmin"
                    description="Administra accesos y sincroniza el CSV oficial."
                  />

                  <ProfileFeatureCard
                    title="PreguntICA"
                    icon={ClipboardCheckIcon}
                    onMainAction={() => navigate(DASHBOARD_ROUTES.managePregunticaQuestions)}
                    tone="superAdmin"
                    description="Banco de preguntas y cache de traducciones."
                  />

                  <ProfileFeatureCard
                    title="Fichas PreguntICA"
                    icon={CoinsIcon}
                    onMainAction={() => navigate(DASHBOARD_ROUTES.managePregunticaTokens)}
                    tone="superAdmin"
                    description="Ajustes manuales de fichas extra por usuario."
                  />
                </>
              )}

              {canManageCalendarIcademy && (
                <>
                  <ProfileFeatureCard
                    title="Calendario ICADEMY"
                    icon={CalendarDaysIcon}
                    onMainAction={() => navigate(DASHBOARD_ROUTES.calendarIcademyManage)}
                    tone="superAdmin"
                    description="Gestiona clases y su visibilidad para alumnos."
                  />
                  <ProfileFeatureCard
                    title="Profesores ICADEMY"
                    icon={UsersIcon}
                    onMainAction={() => navigate(DASHBOARD_ROUTES.calendarIcademyTeachers)}
                    tone="superAdmin"
                    description="Administra docentes y su configuración de agenda."
                  />
                </>
              )}

              {canSeeHistoricLeaderboard && (
                <ProfileFeatureCard
                  title="Histórico leaderboard"
                  icon={TrophyIcon}
                  onMainAction={() => navigate(DASHBOARD_ROUTES.historicLeaderboard)}
                  tone="superAdmin"
                  description="Rankings mensuales cerrados por mes y año."
                />
              )}
            </div>
          </section>
        )}

        <Dialog
          open={isPasswordModalOpen}
          onOpenChange={setIsPasswordModalOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cambiar contraseña</DialogTitle>
              <DialogDescription>
                Ingresa tu contraseña actual y define una nueva.
              </DialogDescription>
            </DialogHeader>

            <form
              id="change-password-form"
              className="space-y-3"
              onSubmit={handlePasswordChange}
            >
              <div className="space-y-1.5">
                <Label htmlFor="profile-current-password">
                  Contraseña actual
                </Label>
                <Input
                  id="profile-current-password"
                  type="password"
                  required
                  minLength={6}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-next-password">Nueva contraseña</Label>
                <Input
                  id="profile-next-password"
                  type="password"
                  required
                  minLength={6}
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-next-password-confirm">
                  Confirmar nueva contraseña
                </Label>
                <Input
                  id="profile-next-password-confirm"
                  type="password"
                  required
                  minLength={6}
                  value={confirmNextPassword}
                  onChange={(event) =>
                    setConfirmNextPassword(event.target.value)
                  }
                />
              </div>

              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-emerald-500">{passwordSuccess}</p>
              )}
            </form>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPasswordModalOpen(false)}
                disabled={isChangingPassword}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="change-password-form"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
