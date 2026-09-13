function define(script)
{
    script.Name = "action_pentalphaJoin";
    script.Type = "ActionCustom";
    return 0;
}

// Join the current pentalpha match on the supplied team
// - params[0]: Team index
function run(source, cState, dState, zone, server, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local matchManager = server.GetMatchManager();
    local worldDB = server.GetWorldDatabase();

    local match = matchManager.GetPentalphaMatch(false);
    if(character == null || match == null || params.len() < 1)
    {
        return Result_t.FAIL;
    }

    local entry = PentalphaEntry();
    entry.SetActive(true);
    entry.SetCharacter(character.GetUUID());
    entry.SetTeam(params[0].tointeger());
    entry.SetMatch(match.GetUUID());
    if(!PersistentObject.Register(entry, UUID()) || !entry.Insert(worldDB))
    {
        return Result_t.FAIL;
    }

    return Result_t.SUCCESS;
}