function define(script)
{
    script.Name = "action_lobbyMove";
    script.Type = "ActionCustom";
    return 0;
}

// Set a character's lobby location when logging in with no instance
// access available
// - params[0]: Zone ID
// - params[1]: X coordinate
// - params[2]: Y coordinate
// - params[3]: Rotation
function run(source, cState, dState, zone, server, params)
{
    local character = cState ? cState.GetEntity() : null;
    if(character == null || params.len() < 4)
    {
        return Result_t.FAIL;
    }

    character.SetLogoutZone(params[0].tointeger());
    character.SetLogoutX(params[1].tointeger());
    character.SetLogoutY(params[2].tointeger());
    character.SetLogoutRotation(params[3].tointeger());

    return Result_t.SUCCESS;
}