function define(script)
{
    script.Name = "transforma_multiplyItemCount";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionAddRemoveItems command using specified item ID, count,
// and value in a zone character flag.
// - params[0]: Item ID.
// - params[1]: Base item count.
// - params[2]: Flag key to check, value of that flag is used a multiplier;
// If unset or 0, a value of 1 is used.
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 3 || zone == null || worldCID == 0)
    {
        return -1;
    }

    local itemType = params[0].tointeger();
    local count = params[1].tointeger();
    local key = params[2].tointeger();

    if(zone.GetFlagState(key, 0, worldCID) == 0)
    {
        action.SetItemsEntry(itemType, count);
    }
    else
    {
        local multiplier = zone.GetFlagState(key, 0, worldCID);
        local newCount = count * multiplier;
        action.SetItemsEntry(itemType, newCount);
    }
    return 0;
}