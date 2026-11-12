export interface LateArrivalWebResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export interface LateArrivalRelayResult {
  status: number;
  payload: Record<string, unknown>;
  successful: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorForStatus(status: number): { error: string; code: string } {
  if (status === 400) {
    return {
      error: "Le serveur Web a refusé la justification du retard. Vérifiez le motif et les pièces jointes.",
      code: "LATE_ARRIVAL_JUSTIFICATION_INVALID",
    };
  }
  if (status === 401) {
    return {
      error: "L'authentification entre les serveurs a échoué pour la justification du retard.",
      code: "LATE_ARRIVAL_WEB_AUTH_FAILED",
    };
  }
  if (status === 403) {
    return {
      error: "Vous n'êtes pas autorisé à justifier ce retard.",
      code: "LATE_ARRIVAL_JUSTIFICATION_FORBIDDEN",
    };
  }
  if (status === 404) {
    return {
      error: "Ce retard est introuvable ou n'est plus accessible.",
      code: "LATE_ARRIVAL_NOT_FOUND",
    };
  }
  if (status === 409) {
    return {
      error: "Une justification a déjà été enregistrée pour ce retard.",
      code: "LATE_ARRIVAL_JUSTIFICATION_CONFLICT",
    };
  }
  return {
    error: "Le serveur Web n'a pas pu enregistrer la justification du retard.",
    code: "LATE_ARRIVAL_WEB_ERROR",
  };
}

export async function relayLateArrivalJustification(
  sendRequest: () => Promise<LateArrivalWebResponse>,
  onTransportError: (error: unknown) => void,
): Promise<LateArrivalRelayResult> {
  let response: LateArrivalWebResponse;
  let responseBody: string;

  try {
    response = await sendRequest();
    responseBody = await response.text();
  } catch (error) {
    onTransportError(error);
    return {
      status: 502,
      payload: {
        error: "La justification du retard n'a pas pu être transmise au serveur Web. Vérifiez votre connexion ou réessayez.",
        code: "LATE_ARRIVAL_RELAY_UNAVAILABLE",
      },
      successful: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    parsed = null;
  }

  if (response.ok && response.status === 201 && isRecord(parsed)) {
    return { status: response.status, payload: parsed, successful: true };
  }

  if (!response.ok && response.status === 404 && !isRecord(parsed)) {
    return {
      status: 404,
      payload: {
        error: "La route Web de justification des retards n'est pas disponible. Une mise à jour coordonnée des serveurs est requise.",
        code: "LATE_ARRIVAL_WEB_ROUTE_UNAVAILABLE",
      },
      successful: false,
    };
  }

  if (!response.ok && isRecord(parsed)) {
    const mappedError = errorForStatus(response.status);
    return {
      status: response.status,
      payload: {
        ...parsed,
        ...mappedError,
      },
      successful: false,
    };
  }

  return {
    status: response.ok ? 502 : response.status,
    payload: {
      error: "Le serveur Web a renvoyé une réponse invalide pour la justification du retard.",
      code: "LATE_ARRIVAL_INVALID_WEB_RESPONSE",
    },
    successful: false,
  };
}
