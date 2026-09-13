function define(script)
{
    script.Name = "action_flagActiveRental";
    script.Type = "ActionCustom";
    return 0;
}

// Set zone character flag based on if a specified item exists in the current
// player's inventory either with no rental time or an active rental time.
// The result flag will have a 0 for false or 1 for true.
// - params[0]: Item type to find
// - params[1]: Flag key
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    local inventory = cState != null ?
        cState.GetEntity().GetItemBoxesByIndex(0).Get() : null;
    if(params.len() < 2 || zone == null || worldCID == 0 ||
        inventory == null)
    {
        return Result_t.FAIL;
    }

    local itemType = params[0].tointeger();
    local key = params[1].tointeger();
    local time = server.GetWorldClockTime().SystemTime;

    zone.SetFlagState(key, 0, worldCID);

    for(local i = 0; i < 50; i++)
    {
        local item = inventory.GetItemsByIndex(i).Get();
        if(item && item.GetType() == itemType &&
            (item.GetRentalExpiration() == 0 || item.GetRentalExpiration() > time))
        {
            zone.SetFlagState(key, 1, worldCID);
            break;
        }
    }

    return Result_t.SUCCESS;
}