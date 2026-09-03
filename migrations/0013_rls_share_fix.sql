-- Correctif de la politique RLS de `share_offer` (toujours INERTE tant que
-- l'app tourne avec le rôle propriétaire — cf. SETUP-RLS.md).
--
-- La version de 0012 avait `with check (from_user_id = …)` : sous RLS active,
-- le DESTINATAIRE ne pourrait pas mettre à jour le statut d'une proposition
-- (la ligne résultante garde `from_user_id` = l'expéditeur). On aligne le
-- `with check` sur le `using` : une partie prenante (émetteur OU destinataire)
-- peut écrire les lignes du fil.

drop policy if exists p_party on share_offer;
create policy p_party on share_offer
  using (
    from_user_id = current_setting('app.user_id', true)
    or to_user_id = current_setting('app.user_id', true)
  )
  with check (
    from_user_id = current_setting('app.user_id', true)
    or to_user_id = current_setting('app.user_id', true)
  );
