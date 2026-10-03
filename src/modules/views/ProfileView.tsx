import { CoachingInviteCard } from "../components/CoachingInvite";
import { t, tn, langName } from '@/i18n'
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  BarChart3Icon,
  BellIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
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
  TrophyIcon as TrophyLucideIcon,
  UserIcon,
  UsersIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { IcaTestGlyph } from "../components/IcaTestParts";
import { LanguageFlag } from "../components/LanguagePicker";
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
import { fichasFormatter, useFichas } from "../game/fichas";
import { FichaIcon, TrophyIcon } from "../game/icons";
import {
  LevelAvatar,
  memberSinceLabel,
  MyFeaturedBadge,
  ProfileGameSummary,
  ProfileStreakPanel,
} from "../game/ProfileGameSummary";
import { isGameSoundEnabled, setGameSoundEnabled } from "../game/sfx";
import { isPronunciationEnabled, setPronunciationEnabled } from "../pronunciation/pronunciation";
import {
  GamePage,
  IconTile,
  ListRow,
  Panel,
  Pill,
  RowGroup,
  SectionLabel,
  SegmentedTabs,
} from "../game/ui";
import { useIcaTestsOverview } from "../hooks/useIcaTestsOverview";
import { fetchAdminRole } from "../services/adminAnalytics";
import {
  fetchCoachingAccess,
  fetchCoachingPendingReviewSummary,
  fetchMyCoachingDashboard,
} from "../services/coaching";
import { DASHBOARD_ROUTES } from "../routes/paths";
import { ChatProfileRow } from "../game/ChatProfileRow";
import {
  ICA_TEST_REQUIRED_WORDS,
} from "../services/icaTests";
import type { AppConfig, Lexicard } from "../types";
import { DISPLAY_NAME_MAX_LENGTH } from "../constants";

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
  const [accessLoaded, setAccessLoaded] = useState(false);
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
    metadata.display_name || user?.email?.split("@")[0] || t("Usuario");
  const memberSince = memberSinceLabel(user?.created_at);
  const [soundOn, setSoundOn] = useState(isGameSoundEnabled);
  const [pronunciationOn, setPronunciationOn] = useState(isPronunciationEnabled);
  const { total: fichasTotal } = useFichas(user?.id);
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
      setAccessLoaded(true);
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
      setPasswordError(t("La nueva contraseña debe tener al menos 6 caracteres."));
      return;
    }

    if (nextPassword !== confirmNextPassword) {
      setPasswordError(t("Las nuevas contraseñas no coinciden."));
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmNextPassword("");
      setPasswordSuccess(t("Contraseña actualizada correctamente."));
      window.setTimeout(() => setIsPasswordModalOpen(false), 900);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("No se pudo actualizar la contraseña");
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
      setNameError(t("El nombre debe tener al menos 3 caracteres."));
      return;
    }

    if (cleanName.length > DISPLAY_NAME_MAX_LENGTH) {
      setNameError(t("El nombre puede tener como mucho {n} caracteres.", { n: DISPLAY_NAME_MAX_LENGTH }));
      return;
    }

    setNameError(null);
    setNameSuccess(null);
    setIsSavingName(true);
    try {
      await updateDisplayName(cleanName);
      setIsEditingName(false);
      setNameSuccess(t("Nombre actualizado correctamente."));
      window.setTimeout(() => setNameSuccess(null), 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("No se pudo actualizar el nombre.");
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

  const icaTestDescription = !featureAvailable
    ? t("Disponible desde mayo de 2026.")
    : hasCurrentMonthTest
      ? t("Ya completaste el test del mes actual.")
      : wordPool.eligible
        ? t("Tienes vocabulario suficiente para hacer el test del mes.")
        : t("Necesitas {required} palabras ICA. Tienes {n}.", { required: ICA_TEST_REQUIRED_WORDS, n: wordPool.availableWords });

  const chevron = (
    <ChevronRightIcon
      className="size-5 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  );

  return (
    <GamePage wide>
      {/* Móvil: esta pantalla es solo «Ajustes de cuenta» (el progreso ya está en la hoja de perfil) */}
      <h1 className="m-0 font-display text-2xl leading-tight font-extrabold tracking-tight md:hidden">
        {t("Ajustes de cuenta")}
      </h1>

      {/* Ordenador: avatar con tu nivel, nombre e insignia destacada */}
      <header className="hidden items-center gap-4 md:flex">
        <LevelAvatar size={80} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="m-0 line-clamp-2 min-w-0 font-display text-3xl leading-tight font-extrabold tracking-tight break-words">
              {displayName}
            </h1>
            <MyFeaturedBadge size={56} />
          </div>
          {memberSince && (
            <p className="m-0 text-sm font-semibold text-muted-foreground">
              {memberSince}
            </p>
          )}
        </div>
      </header>

      {/* Móvil: cuenta, progreso y salir. Ordenador: progreso a la izquierda y cuenta a la derecha */}
      <div className="grid gap-6 [grid-template-areas:'account'_'progress'_'logout'] lg:grid-cols-[minmax(0,1fr)_minmax(0,22.5rem)] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'progress_account'_'progress_logout']">
        <div className="hidden min-w-0 flex-col gap-6 [grid-area:progress] md:flex">
          <div>
            <SectionLabel>{t("Tu progreso")}</SectionLabel>
            <ProfileGameSummary />
          </div>

          <div>
            <SectionLabel>{t("Accesos rápidos")}</SectionLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ProfileFeatureCard
                title={t("Estadísticas")}
                icon={BarChart3Icon}
                iconTone="i"
                onMainAction={() => navigate(DASHBOARD_ROUTES.myAnalytics)}
                description={t("Palabras, frases, notas maestras y flashcards.")}
              />
              <ProfileFeatureCard
                title={t("Tests ICA")}
                icon={<IcaTestGlyph size={30} />}
                iconTone="c"
                onMainAction={() => navigate(DASHBOARD_ROUTES.testsIca)}
                headerRight={
                  canHighlightCurrentMonth && !hasCurrentMonthTest ? (
                    <Pill tone="c" solid className="animate-pulse">
                      {t("Nuevo")}
                    </Pill>
                  ) : null
                }
                description={icaTestDescription}
              />
              <ProfileFeatureCard
                title={t("Calendario")}
                icon={CalendarDaysIcon}
                iconTone="a"
                onMainAction={() => navigate(DASHBOARD_ROUTES.calendarIcademy)}
                description={t("Horarios por idioma y sesiones activas.")}
              />
              <ProfileFeatureCard
                title={t("ICA Coins")}
                icon={<FichaIcon size={30} />}
                iconTone="gold"
                onMainAction={() => navigate(DASHBOARD_ROUTES.fichas)}
                description={
                  fichasTotal === null ? (
                    t("Qué son, cómo se ganan y en qué se gastan.")
                  ) : (
                    <span className="flex flex-col">
                      <span
                        className="text-2xl leading-none font-black tabular-nums"
                        style={{ color: "var(--ica-gold-ink)" }}
                      >
                        {fichasFormatter.format(fichasTotal)}
                      </span>
                      <span>{t("en tu saldo")}</span>
                    </span>
                  )
                }
              />
            </div>
          </div>

          <div>
            <SectionLabel>{t("Comunidad")}</SectionLabel>
            <div className="flex flex-col gap-3">
              <ProfileStreakPanel />
              <RowGroup>
                <ListRow
                  onClick={() => navigate(DASHBOARD_ROUTES.leaderboard)}
                  icon={
                    <IconTile tone="gold" size={42}>
                      <TrophyIcon size={26} />
                    </IconTile>
                  }
                  title={t("Ranking del mes")}
                  text={t("Se cierra el día 28 y el top 3 gana premio.")}
                />
                <ListRow
                  onClick={() => navigate(DASHBOARD_ROUTES.instagramTrackPosts)}
                  icon={
                    <IconTile tone="c" size={42}>
                      <CameraIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                    </IconTile>
                  }
                  title={t("Track Instagram")}
                  text={t("Cada día con post suma puntos al ranking.")}
                />
              </RowGroup>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6 [grid-area:account]">
          <div>
            <SectionLabel>{t("Tu cuenta")}</SectionLabel>
            <RowGroup>
              {/* Nombre (se edita aquí mismo) */}
              <div className="py-3">
                <div className="flex items-center gap-3">
                  <IconTile tone="primary" size={42}>
                    <UserIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                  </IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-muted-foreground">
                      {t("Nombre")}
                    </span>
                    <span className="block truncate leading-tight font-extrabold">
                      {displayName}
                    </span>
                  </span>
                  {!isEditingName && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleStartNameEdit}
                      aria-label={t("Editar nombre")}
                    >
                      <PencilIcon className="size-3.5" strokeWidth={2.6} />
                      {t("Editar")}
                    </Button>
                  )}
                </div>
                {isEditingName && (
                  <form
                    className="mt-3 flex flex-col gap-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSaveName();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={nameDraft}
                        onChange={(event) => {
                          setNameDraft(event.target.value);
                          setNameError(null);
                          setNameSuccess(null);
                        }}
                        onKeyDown={handleNameKeyDown}
                        minLength={3}
                        maxLength={DISPLAY_NAME_MAX_LENGTH}
                        required
                        autoFocus
                        className="h-11 min-w-0 flex-1"
                        aria-label={t("Editar nombre")}
                      />
                      <Button
                        type="submit"
                        variant="success"
                        size="icon-lg"
                        aria-label={t("Guardar nombre")}
                        disabled={isSavingName || !canSaveName}
                      >
                        <CheckIcon className="size-5" strokeWidth={3} />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        aria-label={t("Cancelar edición de nombre")}
                        onClick={handleCancelNameEdit}
                        disabled={isSavingName}
                      >
                        <XIcon className="size-5" strokeWidth={2.6} />
                      </Button>
                    </div>
                    <span className="text-right text-xs font-bold text-muted-foreground tabular-nums">
                      {cleanNameDraft.length}/{DISPLAY_NAME_MAX_LENGTH}
                    </span>
                  </form>
                )}
                {nameError && (
                  <p className="m-0 mt-2 text-xs font-bold" style={{ color: "var(--ica-bad-ink)" }}>
                    {nameError}
                  </p>
                )}
                {nameSuccess && (
                  <p className="m-0 mt-2 text-xs font-bold" style={{ color: "var(--ica-ok-ink)" }}>
                    {nameSuccess}
                  </p>
                )}
              </div>

              <ListRow
                onClick={onEditLanguages}
                icon={
                  <IconTile tone="i" size={42}>
                    <LanguagesIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                  </IconTile>
                }
                title={t("Idiomas")}
                text={
                  config
                    ? `${langName(config.nativeLang)} → ${langName(config.targetLang)}`
                    : t("No hay configuración de idiomas")
                }
                right={
                  <span className="flex shrink-0 items-center gap-1.5">
                    {config ? (
                      <>
                        <LanguageFlag language={config.nativeLang} size={26} />
                        <LanguageFlag language={config.targetLang} size={26} />
                      </>
                    ) : null}
                    {chevron}
                  </span>
                }
              />

              <ListRow
                onClick={() => {
                  setPasswordError(null);
                  setPasswordSuccess(null);
                  setCurrentPassword("");
                  setNextPassword("");
                  setConfirmNextPassword("");
                  setIsPasswordModalOpen(true);
                }}
                icon={
                  <IconTile tone="ok" size={42}>
                    <ShieldIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                  </IconTile>
                }
                title={t("Cambiar contraseña")}
                text={t("Actualiza tu contraseña con validación de seguridad.")}
              />

              <ListRow
                onClick={() => navigate(DASHBOARD_ROUTES.manageNotifications)}
                icon={
                  <IconTile tone="gold" size={42}>
                    <BellIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                  </IconTile>
                }
                title={t("Notificaciones")}
                text={t("Recordatorios de rachas y hábitos por push.")}
              />
              {config?.targetLang ? <ChatProfileRow targetLang={config.targetLang} /> : null}
            </RowGroup>
          </div>

          <div>
            <SectionLabel>{t("Preferencias")}</SectionLabel>
            <Panel className="flex flex-col gap-4">
              <div>
                <p className="m-0 mb-2 text-sm font-extrabold">
                  {t("Tema ({theme})", { theme: resolvedTheme === "dark" ? t("Oscuro") : t("Claro") })}
                </p>
                <SegmentedTabs
                  ariaLabel={t("Tema")}
                  value={theme}
                  onChange={(value) => setTheme(value)}
                  options={[
                    {
                      value: "light",
                      label: t("Claro"),
                      icon: <SunIcon className="size-4" strokeWidth={2.6} aria-hidden="true" />,
                    },
                    {
                      value: "dark",
                      label: t("Oscuro"),
                      icon: <MoonIcon className="size-4" strokeWidth={2.6} aria-hidden="true" />,
                    },
                  ]}
                />
              </div>
              <div>
                <p className="m-0 text-sm font-extrabold">{t("Pronunciación")}</p>
                <p className="m-0 mb-2 text-xs font-semibold text-muted-foreground">
                  {t("Cómo suena cada palabra (beaucoup → /bocú/) en las flashcards y en Inmersión.")}
                </p>
                <SegmentedTabs
                  ariaLabel={t("Pronunciación")}
                  value={pronunciationOn ? "on" : "off"}
                  onChange={(value) => {
                    const next = value === "on";
                    setPronunciationEnabled(next);
                    setPronunciationOn(next);
                  }}
                  options={[
                    { value: "on", label: t("Visible") },
                    { value: "off", label: t("Oculta") },
                  ]}
                />
              </div>
              <div>
                <p className="m-0 text-sm font-extrabold">{t("Sonidos")}</p>
                <p className="m-0 mb-2 text-xs font-semibold text-muted-foreground">
                  {t("Al abrir el cofre del ciclo y al completar el ciclo ICA.")}
                </p>
                <SegmentedTabs
                  ariaLabel={t("Sonidos")}
                  value={soundOn ? "on" : "off"}
                  onChange={(value) => {
                    const next = value === "on";
                    setGameSoundEnabled(next);
                    setSoundOn(next);
                  }}
                  options={[
                    {
                      value: "on",
                      label: t("Activados"),
                      icon: <Volume2Icon className="size-4" strokeWidth={2.6} aria-hidden="true" />,
                    },
                    {
                      value: "off",
                      label: t("Apagados"),
                      icon: <VolumeXIcon className="size-4" strokeWidth={2.6} aria-hidden="true" />,
                    },
                  ]}
                />
              </div>
            </Panel>
          </div>

          <div>
            <SectionLabel>{t("Más")}</SectionLabel>
            <RowGroup>
              <ListRow
                onClick={() => navigate(DASHBOARD_ROUTES.trackers)}
                icon={
                  <IconTile tone="i" size={42}>
                    <LineChartIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                  </IconTile>
                }
                title={t("Trackers")}
                text={t("Pronunciación, fluidez e improvisación mensual.")}
              />
            </RowGroup>
          </div>

          {/* Quien no está en el coaching ve la invitación; los admins de coaching, como vista previa. */}
          {accessLoaded && (canManageCoaching || !canSeeCoachingPersonalized) && (
            <div>
              <SectionLabel>{canManageCoaching ? t("Coaching (vista de alumno)") : t("Coaching")}</SectionLabel>
              <CoachingInviteCard preview={canManageCoaching} />
            </div>
          )}

          {(canSeeCoachingPersonalized || canManageCoaching) && (
            <div>
              <SectionLabel>{t("Coaching")}</SectionLabel>
              <RowGroup>
                {canSeeCoachingPersonalized && (
                  <ListRow
                    onClick={() => navigate(DASHBOARD_ROUTES.coachingPersonalized)}
                    icon={
                      <IconTile tone="i" size={42}>
                        <GraduationCapIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                      </IconTile>
                    }
                    title={t("Coaching personalizado")}
                    text={t("Clases semanales, feedback y objetivos ICA.")}
                  />
                )}
                {canManageCoaching && (
                  <ListRow
                    onClick={() => navigate(DASHBOARD_ROUTES.manageCoaching)}
                    icon={
                      <IconTile tone="i" size={42}>
                        <UsersIcon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
                      </IconTile>
                    }
                    title={t("Administrar coaching")}
                    text={
                      pendingCoachingSessions > 0
                        ? t("Pendientes: {notes} en {sessions}.", {
                            notes: tn(pendingCoachingNotes, "{n} nota", "{n} notas"),
                            sessions: tn(pendingCoachingSessions, "{n} sesión", "{n} sesiones"),
                          })
                        : t("Gestiona usuarios, feedback y objetivos personalizados.")
                    }
                    right={
                      pendingCoachingSessions > 0 ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <PendingReviewDot
                            title={t("Tienes {notes} notas pendientes de revisión en {sessions} sesiones.", { notes: pendingCoachingNotes, sessions: pendingCoachingSessions })}
                            useIconSpeaker
                          />
                          {chevron}
                        </span>
                      ) : undefined
                    }
                  />
                )}
              </RowGroup>
            </div>
          )}

          {(canSeeAdminAnalytics ||
            canManageWhitelist ||
            canManageCalendarIcademy ||
            canSeeHistoricLeaderboard) && (
            <div>
              <SectionLabel>{t("Administración")}</SectionLabel>
              <RowGroup>
                {canSeeAdminAnalytics && (
                  <AdminRow
                    icon={BarChart3Icon}
                    title={t("Analíticas admin")}
                    text={t("Métricas globales de la plataforma.")}
                    onClick={() => navigate(DASHBOARD_ROUTES.analytics)}
                  />
                )}
                {canManageWhitelist && (
                  <>
                    <AdminRow
                      icon={ListChecksIcon}
                      title={t("Whitelist")}
                      text={t("Administra accesos y sincroniza el CSV oficial.")}
                      onClick={() => navigate(DASHBOARD_ROUTES.manageWhitelist)}
                    />
                    <AdminRow
                      icon={ClipboardCheckIcon}
                      title={t("PreguntICA")}
                      text={t("Banco de preguntas y cache de traducciones.")}
                      onClick={() => navigate(DASHBOARD_ROUTES.managePregunticaQuestions)}
                    />
                    <AdminRow
                      icon={CoinsIcon}
                      title={t("ICA Coins de usuarios")}
                      text={t("Da o quita ICA Coins a mano a cualquier persona.")}
                      onClick={() => navigate(DASHBOARD_ROUTES.managePregunticaTokens)}
                    />
                  </>
                )}
                {canManageCalendarIcademy && (
                  <>
                    <AdminRow
                      icon={CalendarDaysIcon}
                      title={t("Calendario ICADEMY")}
                      text={t("Gestiona clases y su visibilidad para alumnos.")}
                      onClick={() => navigate(DASHBOARD_ROUTES.calendarIcademyManage)}
                    />
                    <AdminRow
                      icon={UsersIcon}
                      title={t("Profesores ICADEMY")}
                      text={t("Administra docentes y su configuración de agenda.")}
                      onClick={() => navigate(DASHBOARD_ROUTES.calendarIcademyTeachers)}
                    />
                  </>
                )}
                {canSeeHistoricLeaderboard && (
                  <AdminRow
                    icon={TrophyLucideIcon}
                    title={t("Histórico leaderboard")}
                    text={t("Rankings mensuales cerrados por mes y año.")}
                    onClick={() => navigate(DASHBOARD_ROUTES.historicLeaderboard)}
                  />
                )}
              </RowGroup>
            </div>
          )}
        </div>

        <div className="[grid-area:logout]">
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="ica-press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 text-base font-extrabold disabled:opacity-60"
            style={{
              borderColor:
                "color-mix(in oklab, var(--ica-bad-strong) 35%, var(--border))",
              color: "var(--ica-bad-ink)",
              boxShadow:
                "0 3px 0 color-mix(in oklab, var(--ica-bad-strong) 25%, var(--border))",
            }}
          >
            <LogOutIcon className="size-5" strokeWidth={2.6} aria-hidden="true" />
            {isLoggingOut ? t("Cerrando sesión...") : t("Cerrar sesión")}
          </button>
          <p className="m-0 mt-2 text-center text-xs font-semibold text-muted-foreground">
            {t("Finaliza tu sesión actual en el dispositivo.")}
          </p>
        </div>
      </div>

      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <IconTile tone="ok" size={52}>
              <ShieldIcon className="size-7" strokeWidth={2.5} aria-hidden="true" />
            </IconTile>
            <DialogTitle>{t("Cambiar contraseña")}</DialogTitle>
            <DialogDescription>
              {t("Escribe tu contraseña actual y elige una nueva.")}
            </DialogDescription>
          </DialogHeader>

          <form
            id="change-password-form"
            className="flex flex-col gap-3"
            onSubmit={handlePasswordChange}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-current-password" className="font-extrabold">
                {t("Contraseña actual")}
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-next-password" className="font-extrabold">
                {t("Nueva contraseña")}
              </Label>
              <Input
                id="profile-next-password"
                type="password"
                required
                minLength={6}
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-next-password-confirm" className="font-extrabold">
                {t("Confirmar nueva contraseña")}
              </Label>
              <Input
                id="profile-next-password-confirm"
                type="password"
                required
                minLength={6}
                value={confirmNextPassword}
                onChange={(event) => setConfirmNextPassword(event.target.value)}
              />
            </div>

            {passwordError && (
              <p className="m-0 text-sm font-bold" style={{ color: "var(--ica-bad-ink)" }}>
                {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="m-0 text-sm font-bold" style={{ color: "var(--ica-ok-ink)" }}>
                {passwordSuccess}
              </p>
            )}
          </form>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setIsPasswordModalOpen(false)}
              disabled={isChangingPassword}
            >
              {t("Cancelar")}
            </Button>
            <Button
              type="submit"
              size="lg"
              form="change-password-form"
              disabled={isChangingPassword}
            >
              {isChangingPassword ? t("Guardando...") : t("Guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GamePage>
  );
}

/** Fila de administración (discreta, en gris). */
function AdminRow({
  icon: Icon,
  title,
  text,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <ListRow
      onClick={onClick}
      icon={
        <IconTile tone="neutral" size={42}>
          <Icon className="size-[22px]" strokeWidth={2.5} aria-hidden="true" />
        </IconTile>
      }
      title={title}
      text={text}
    />
  );
}
