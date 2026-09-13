function define(script)
{
    script.Name = "bool_isMitamaFused";
    script.Type = "EventCondition";
    return 0;
}

// Check if a demon is currently summoned and is mitama fused
function check(source, cState, dState, zone, value1, value2, params)
{
    local demon = dState != null ? dState.GetEntity() : null;
    if(demon != null)
    {
        return demon.GetMitamaType() != 0 ? 0 : -1;
    }

    return -1;

}