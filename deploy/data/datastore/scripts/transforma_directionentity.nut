function define(script)
{
    script.Name = "transforma_directionEntity";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionSpecialDirection command to use a player entity ID as the
// direction value
// - params[0]: CHARACTER, DEMON or SOURCE (defaults to CHARACTER)
function transform(source, cState, dState, zone, params)
{
    local entity = cState;
    if(params.len() >= 1 && params[0] == "DEMON")
    {
        entity = dState;
    }
    else if(params.len() >= 1 && params[0] == "SOURCE")
    {
        entity = source;
    }

    if(entity != null)
    {
        action.SetDirection(entity.GetEntityID());
    
        return 0;
    }
    else
    {
        return -1;
    }
}